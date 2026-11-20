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
using NAudio.Wave.SampleProviders;

namespace Opung.Windows;

public sealed class MainForm : Form
{
    private const int FixedLogicalWidth = 390;
    private const int DefaultLogicalHeight = 590;

    private enum VbCableStartResult
    {
        Ready,
        Missing,
        Error,
    }

    private readonly WebView2 _webView;
    private readonly NotifyIcon _trayIcon;
    private readonly Icon _appIcon;
    private readonly object _audioLock = new();

    private WasapiOut? _wasapiOut;
    private MMDevice? _activeVbCableDevice;
    private BufferedWaveProvider? _waveBuffer;
    private int _currentLogicalHeight = DefaultLogicalHeight;
    private bool _sinkEnabled;
    private bool _allowClose;
    private bool _cleanedUp;
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
        ClientSize = ScaleLogicalSize(FixedLogicalWidth, _currentLogicalHeight);

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
        DpiChanged += (_, _) => ApplyLogicalClientSize(_currentLogicalHeight);
        FormClosing += OnMainFormClosing;
    }

    private Size ScaleLogicalSize(int logicalWidth, int logicalHeight)
    {
        float dpiScale = DeviceDpi > 0 ? DeviceDpi / 96.0f : 1.0f;
        return new Size(
            (int)Math.Ceiling(logicalWidth * dpiScale),
            (int)Math.Ceiling(logicalHeight * dpiScale)
        );
    }

    private void ApplyLogicalClientSize(int logicalHeight)
    {
        _currentLogicalHeight = Math.Clamp(logicalHeight, 480, 760);
        var scaled = ScaleLogicalSize(FixedLogicalWidth, _currentLogicalHeight);
        if (ClientSize != scaled)
        {
            ClientSize = scaled;
        }
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
                BeginInvoke(() => ApplyLogicalClientSize(targetHeight));
            }
            return;
        }

        if (message == "SINK:ON")
        {
            var result = StartVirtualCableOutput();
            string statusMsg = result switch
            {
                VbCableStartResult.Ready => "VBCABLE_READY",
                VbCableStartResult.Missing => "VBCABLE_MISSING",
                _ => "VBCABLE_ERROR",
            };
            NotifyWebViewSinkStatus(statusMsg);
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
        if (IsDisposed || _webView.CoreWebView2 == null)
        {
            return;
        }
        BeginInvoke(() =>
        {
            try
            {
                if (!IsDisposed)
                {
                    _webView.CoreWebView2?.PostWebMessageAsString(statusMessage);
                }
            }
            catch
            {
                // Ignore if disposed
            }
        });
    }

    private VbCableStartResult StartVirtualCableOutput()
    {
        lock (_audioLock)
        {
            if (_wasapiOut != null && _sinkEnabled)
            {
                return VbCableStartResult.Ready;
            }

            StopVirtualCableOutputLocked();

            MMDevice? selectedDevice = null;
            try
            {
                using var enumerator = new MMDeviceEnumerator();
                var renderDevices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);

                foreach (var device in renderDevices)
                {
                    var name = (device.FriendlyName ?? string.Empty).ToLowerInvariant();
                    bool isMatch =
                        name.Contains("cable input") ||
                        name.Contains("vb-audio") ||
                        name.Contains("vb-cable") ||
                        name.Contains("voicemeeter input");

                    if (isMatch && selectedDevice == null)
                    {
                        selectedDevice = device;
                    }
                    else if (isMatch && selectedDevice != null && name.Contains("cable input"))
                    {
                        selectedDevice.Dispose();
                        selectedDevice = device;
                    }
                    else
                    {
                        device.Dispose();
                    }
                }

                if (selectedDevice == null)
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
                    return VbCableStartResult.Missing;
                }

                // Buffer input 48 kHz 16-bit Mono PCM dari AudioWorklet Opung,
                // lalu otomatis di-resample ke MixFormat asli VB-CABLE (44.1 kHz / 48 kHz / 96 kHz, 1/2/N channel, IEEE Float)
                var inputMonoFormat = new WaveFormat(48000, 16, 1);
                _waveBuffer = new BufferedWaveProvider(inputMonoFormat)
                {
                    BufferDuration = TimeSpan.FromMilliseconds(220),
                    DiscardOnBufferOverflow = true,
                    ReadFully = true,
                };

                WaveFormat mixFormat = selectedDevice.AudioClient.MixFormat;
                ISampleProvider sampleProvider = _waveBuffer.ToSampleProvider();
                if (sampleProvider.WaveFormat.SampleRate != mixFormat.SampleRate)
                {
                    sampleProvider = new WdlResamplingSampleProvider(sampleProvider, mixFormat.SampleRate);
                }

                if (mixFormat.Channels == 2 && sampleProvider.WaveFormat.Channels == 1)
                {
                    sampleProvider = new MonoToStereoSampleProvider(sampleProvider);
                }
                else if (mixFormat.Channels > 2 && sampleProvider.WaveFormat.Channels == 1)
                {
                    var mux = new MultiplexingSampleProvider(new[] { sampleProvider }, mixFormat.Channels);
                    for (int ch = 0; ch < mixFormat.Channels; ch++)
                    {
                        mux.ConnectInputToOutput(0, ch);
                    }
                    sampleProvider = mux;
                }

                _activeVbCableDevice = selectedDevice;
                selectedDevice = null;
                _wasapiOut = new WasapiOut(_activeVbCableDevice, AudioClientShareMode.Shared, false, 30);
                _wasapiOut.Init(sampleProvider.ToWaveProvider());
                _wasapiOut.Play();
                _sinkEnabled = true;
                return VbCableStartResult.Ready;
            }
            catch
            {
                selectedDevice?.Dispose();
                StopVirtualCableOutputLocked();
                return VbCableStartResult.Error;
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

        int alignedBytes = monoBytes.Length & ~1;
        if (alignedBytes < 2)
        {
            return;
        }

        lock (_audioLock)
        {
            if (!_sinkEnabled || _waveBuffer == null)
            {
                return;
            }

            _waveBuffer.AddSamples(monoBytes, 0, alignedBytes);
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
        if (_activeVbCableDevice != null)
        {
            try
            {
                _activeVbCableDevice.Dispose();
            }
            catch
            {
                // Ignore cleanup error
            }
            _activeVbCableDevice = null;
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

    private void CleanupResourcesOnce()
    {
        if (_cleanedUp)
        {
            return;
        }
        _cleanedUp = true;
        StopVirtualCableOutput();
        try
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
        }
        catch
        {
            // Ignore tray cleanup failure
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

        CleanupResourcesOnce();
    }

    private void ExitApplication()
    {
        _allowClose = true;
        CleanupResourcesOnce();
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
