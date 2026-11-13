using System;
using System.Threading;
using System.Windows.Forms;

namespace Opung.Windows;

internal static class Program
{
    private static Mutex? _singleInstanceMutex;

    [STAThread]
    private static void Main()
    {
        bool createdNew;
        _singleInstanceMutex = new Mutex(true, "OpungOfficeProximityNoiseGate_SingleInstance", out createdNew);

        if (!createdNew)
        {
            MessageBox.Show(
                "Opung sudah berjalan di System Tray (ikon di kanan bawah sebelah jam Windows).",
                "Opung",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.Run(new MainForm());

        GC.KeepAlive(_singleInstanceMutex);
    }
}
