using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace Opung.Windows;

public sealed class MainForm : Form
{
    private const int FixedLogicalWidth = 390;
    private const int DefaultLogicalHeight = 532;

    private readonly WebView2 _webView;
    private readonly NotifyIcon _trayIcon;
    private readonly Icon _appIcon;
    private readonly object _audioLock = new();

    private WasapiOut? _wasapiOut;
    private BufferedWaveProvider? _waveBuffer;
    private byte[] _stereoScratch = Array.Empty<byte>();
    private bool _sinkEnabled;
    private bool _allowClose;
    private bool _vbCablePromptShown;

    public MainForm()
    {
        _appIcon = LoadEmbeddedIcon() ?? SystemIcons.Application;

        Text = "Opung - Office Proximity Ultra Noise Gate";
        Icon = _appIcon;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(9, 13, 22);
        ClientSize = new Size(FixedLogicalWidth, DefaultLogicalHeight);

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(9, 13, 22),
        };
        Controls.Add(_webView);

        var trayMenu = new ContextMenuStrip();
        trayMenu.Items.Add("Buka / Sembunyikan Opung", null, (_, _) => ToggleWindowVisibility());
        trayMenu.Items.Add("Pasang Driver VB-CABLE (Virtual Mic)...", null, (_, _) => OpenVbCableDownloadPage());
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add("Keluar Opung", null, (_, _) => ExitApplication());

        _trayIcon = new NotifyIcon
        {
            Icon = _appIcon,
            Text = "Opung - Office Proximity Ultra Noise Gate",
            Visible = true,
            ContextMenuStrip = trayMenu,
        };
        _trayIcon.Click += (_, args) =>
        {
            if (args is MouseEventArgs mouseArgs && mouseArgs.Button == MouseButtons.Left)
            {
                ToggleWindowVisibility();
            }
        };

        Load += async (_, _) => await InitializeWebViewAsync();
        FormClosing += OnMainFormClosing;
    }

    private async System.Threading.Tasks.Task InitializeWebViewAsync()
    {
        try
        {
            var localAppDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Opung"
            );
            var webRootDir = Path.Combine(localAppDir, "app");
            var userDataDir = Path.Combine(localAppDir, "WebView2");
            Directory.CreateDirectory(webRootDir);
            Directory.CreateDirectory(userDataDir);

            var indexPath = Path.Combine(webRootDir, "index.html");
            var html = LoadEmbeddedHtml();
            File.WriteAllText(indexPath, html);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataDir);
            await _webView.EnsureCoreWebView2Async(env);

            var core = _webView.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;

            core.SetVirtualHostNameToFolderMapping(
                "opung.local",
                webRootDir,
                CoreWebView2HostResourceAccessKind.Allow
            );

            core.PermissionRequested += (_, e) =>
            {
                if (e.PermissionKind == CoreWebView2PermissionKind.Microphone)
                {
                    e.State = CoreWebView2PermissionState.Allow;
                    e.Handled = true;
                }
            };

            core.WebMessageReceived += OnWebMessageReceived;
            _webView.Source = new Uri("https://opung.local/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            var result = MessageBox.Show(
                "Komponen Microsoft Edge WebView2 Runtime belum terpasang di Windows Anda.\n\nApakah Anda ingin membuka halaman unduhan resmi Microsoft WebView2 sekarang?",
                "Opung - WebView2 Diperlukan",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning
            );
            if (result == DialogResult.Yes)
            {
                OpenUrl("https://developer.microsoft.com/en-us/microsoft-edge/webview2/");
            }
            ExitApplication();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Gagal memulai jendela Opung:\n{ex.Message}",
                "Opung Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string message;
        try
        {
            message = e.TryGetWebMessageAsString();
        }
        catch
        {
            return;
        }

        if (string.IsNullOrEmpty(message))
        {
            return;
        }

        if (message.StartsWith("HEIGHT:", StringComparison.Ordinal))
        {
            if (int.TryParse(message.AsSpan(7), out int rawHeight))
            {
                int targetHeight = Math.Clamp(rawHeight, 480, 760);
                BeginInvoke(() =>
                {
                    if (ClientSize.Height != targetHeight || ClientSize.Width != FixedLogicalWidth)
                    {
                        ClientSize = new Size(FixedLogicalWidth, targetHeight);
                    }
                });
            }
            return;
        }

        if (message == "SINK:ON")
        {
            bool started = StartVirtualCableOutput();
            NotifyWebViewSinkStatus(started ? "VBCABLE_READY" : "VBCABLE_MISSING");
            return;
        }

        if (message == "SINK:OFF")
        {
            StopVirtualCableOutput();
            return;
        }

        if (_sinkEnabled)
        {
            FeedPcm16MonoBase64(message);
        }
    }

    private void NotifyWebViewSinkStatus(string statusMessage)
    {
        if (_webView.CoreWebView2 == null)
        {
            return;
        }
        BeginInvoke(() =>
        {
            try
            {
                _webView.CoreWebView2?.PostWebMessageAsString(statusMessage);
            }
            catch
            {
                // Ignore if disposed
            }
        });
    }

    private bool StartVirtualCableOutput()
    {
        lock (_audioLock)
        {
            if (_wasapiOut != null && _sinkEnabled)
            {
                return true;
            }

            StopVirtualCableOutputLocked();

            try
            {
                using var enumerator = new MMDeviceEnumerator();
                var renderDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);

                MMDevice? vbCableDevice = renderDevices.FirstOrDefault(d =>
                {
                    var name = (d.FriendlyName ?? string.Empty).ToLowerInvariant();
                    return name.Contains("cable input") ||
                           name.Contains("vb-audio") ||
                           name.Contains("vb-cable") ||
                           name.Contains("voicemeeter input");
                });

                if (vbCableDevice == null)
                {
                    _sinkEnabled = false;
                    if (!_vbCablePromptShown)
                    {
                        _vbCablePromptShown = true;
                        BeginInvoke(() =>
                        {
                            var ask = MessageBox.Show(
                                "Driver mikrofon virtual VB-CABLE belum ditemukan di Windows.\n\nOpung membutuhkan VB-Audio Virtual Cable (gratis) agar suara jernih bisa masuk ke Google Meet / Zoom.\n\nBuka halaman unduhan VB-CABLE sekarang?",
                                "Opung - Driver Virtual Mic (VB-CABLE)",
                                MessageBoxButtons.YesNo,
                                MessageBoxIcon.Information
                            );
                            if (ask == DialogResult.Yes)
                            {
                                OpenVbCableDownloadPage();
                            }
                        });
                    }
                    return false;
                }

                // 48 kHz 16-bit Stereo PCM agar cocok 100% dengan default VB-Audio Virtual Cable
                var stereoFormat = new WaveFormat(48000, 16, 2);
                _waveBuffer = new BufferedWaveProvider(stereoFormat)
                {
                    BufferDuration = TimeSpan.FromMilliseconds(220),
                    DiscardOnBufferOverflow = true,
                    ReadFully = true,
                };

                _wasapiOut = new WasapiOut(vbCableDevice, AudioClientShareMode.Shared, false, 30);
                _wasapiOut.Init(_waveBuffer);
                _wasapiOut.Play();
                _sinkEnabled = true;
                return true;
            }
            catch
            {
                StopVirtualCableOutputLocked();
                return false;
            }
        }
    }

    private void FeedPcm16MonoBase64(string base64Pcm)
    {
        byte[] monoBytes;
        try
        {
            monoBytes = Convert.FromBase64String(base64Pcm);
        }
        catch
        {
            return;
        }

        if (monoBytes.Length < 2)
        {
            return;
        }

        lock (_audioLock)
        {
            if (!_sinkEnabled || _waveBuffer == null)
            {
                return;
            }

            int stereoLength = monoBytes.Length * 2;
            if (_stereoScratch.Length < stereoLength)
            {
                _stereoScratch = new byte[stereoLength];
            }

            // Duplikasi sampel mono Int16 menjadi Stereo (L + R) untuk VB-CABLE
            int samplePairs = monoBytes.Length / 2;
            for (int i = 0; i < samplePairs; i++)
            {
                int srcIdx = i * 2;
                int dstIdx = i * 4;
                byte lo = monoBytes[srcIdx];
                byte hi = monoBytes[srcIdx + 1];
                _stereoScratch[dstIdx] = lo;
                _stereoScratch[dstIdx + 1] = hi;
                _stereoScratch[dstIdx + 2] = lo;
                _stereoScratch[dstIdx + 3] = hi;
            }

            _waveBuffer.AddSamples(_stereoScratch, 0, samplePairs * 4);
        }
    }

    private void StopVirtualCableOutput()
    {
        lock (_audioLock)
        {
            StopVirtualCableOutputLocked();
        }
    }

    private void StopVirtualCableOutputLocked()
    {
        _sinkEnabled = false;
        if (_wasapiOut != null)
        {
            try
            {
                _wasapiOut.Stop();
                _wasapiOut.Dispose();
            }
            catch
            {
                // Ignore cleanup error
            }
            _wasapiOut = null;
        }
        _waveBuffer = null;
    }

    private void ToggleWindowVisibility()
    {
        if (Visible && WindowState != FormWindowState.Minimized)
        {
            Hide();
        }
        else
        {
            Show();
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            Activate();
        }
    }

    private void OnMainFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!_allowClose && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            _trayIcon.ShowBalloonTip(
                2200,
                "Opung Tetap Aktif",
                "Opung berjalan di System Tray sebelah jam Windows. Klik ikon Opung untuk membuka kembali.",
                ToolTipIcon.Info
            );
            return;
        }

        StopVirtualCableOutput();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
    }

    private void ExitApplication()
    {
        _allowClose = true;
        StopVirtualCableOutput();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        Close();
        Application.Exit();
    }

    private static void OpenVbCableDownloadPage()
    {
        OpenUrl("https://vb-audio.com/Cable/");
    }

    private static void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            });
        }
        catch
        {
            // Ignore shell open failure
        }
    }

    private static Icon? LoadEmbeddedIcon()
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly();
            var resourceName = asm.GetManifestResourceNames()
                .FirstOrDefault(n => n.EndsWith("AppIcon.ico", StringComparison.OrdinalIgnoreCase));
            if (resourceName == null)
            {
                return null;
            }
            using var stream = asm.GetManifestResourceStream(resourceName);
            return stream != null ? new Icon(stream) : null;
        }
        catch
        {
            return null;
        }
    }

    private static string LoadEmbeddedHtml()
    {
        var asm = Assembly.GetExecutingAssembly();
        var resourceName = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("index.html", StringComparison.OrdinalIgnoreCase));
        if (resourceName == null)
        {
            throw new FileNotFoundException("Embedded index.html resource not found.");
        }
        using var stream = asm.GetManifestResourceStream(resourceName)
            ?? throw new FileNotFoundException("Failed to open embedded index.html stream.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
