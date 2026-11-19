// Slaughtermate desktop launcher.
// The game (index.html) is embedded in this .exe. On launch it is unpacked to
// %LOCALAPPDATA%\Slaughtermate and opened in its own app window using Microsoft
// Edge (built into Windows 10/11). Falls back to Chrome, then the default browser.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Slaughtermate")]
[assembly: AssemblyProduct("Slaughtermate")]
[assembly: AssemblyVersion("1.0.0.0")]

static class Launcher
{
    [STAThread]
    static void Main()
    {
        try
        {
            string root = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Slaughtermate");
            Directory.CreateDirectory(root);

            // Always refresh the game file so a newer .exe ships its newer game.
            string page = Path.Combine(root, "index.html");
            using (Stream src = Assembly.GetExecutingAssembly().GetManifestResourceStream("index.html"))
            using (FileStream dst = File.Create(page))
            {
                src.CopyTo(dst);
            }

            string url = new Uri(page).AbsoluteUri;
            // Dedicated browser profile: keeps the Hall of Kings scores and player
            // name saved between runs, separate from the user's normal browsing.
            string profile = Path.Combine(root, "profile");
            string args = "--app=\"" + url + "\" --user-data-dir=\"" + profile + "\"" +
                          " --window-size=1280,800 --no-first-run --no-default-browser-check";

            string[] browsers =
            {
                Env("ProgramFiles(x86)", @"Microsoft\Edge\Application\msedge.exe"),
                Env("ProgramFiles", @"Microsoft\Edge\Application\msedge.exe"),
                Env("LOCALAPPDATA", @"Microsoft\Edge\Application\msedge.exe"),
                Env("ProgramFiles", @"Google\Chrome\Application\chrome.exe"),
                Env("ProgramFiles(x86)", @"Google\Chrome\Application\chrome.exe"),
                Env("LOCALAPPDATA", @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string exe in browsers)
            {
                if (exe != null && File.Exists(exe))
                {
                    Process.Start(new ProcessStartInfo(exe, args) { UseShellExecute = false });
                    return;
                }
            }

            // Last resort: whatever browser is set as default.
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show("Could not start Slaughtermate:\n\n" + ex.Message, "Slaughtermate",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static string Env(string var, string rel)
    {
        string baseDir = Environment.GetEnvironmentVariable(var);
        return string.IsNullOrEmpty(baseDir) ? null : Path.Combine(baseDir, rel);
    }
}
