using System;
using System.Runtime.InteropServices;
using System.Threading;

class DefraKlawiatura31 {

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT_UNION {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public INPUT_UNION u;
    }

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_UNICODE = 0x0004;
    const uint KEYEVENTF_KEYUP = 0x0002;

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    static void SendChar(char c) {
        INPUT down = new INPUT();
        down.type = INPUT_KEYBOARD;
        down.u.ki.wScan = (ushort)c;
        down.u.ki.dwFlags = KEYEVENTF_UNICODE;

        INPUT up = new INPUT();
        up.type = INPUT_KEYBOARD;
        up.u.ki.wScan = (ushort)c;
        up.u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

        SendInput(2, new INPUT[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
    }

    static void Main(string[] args) {
        if (args.Length < 2) return;

        string text = args[0];
        int delay = int.Parse(args[1]);

        Thread.Sleep(200);

        foreach (char c in text) {
            SendChar(c);
            Thread.Sleep(delay);
        }
    }
}
