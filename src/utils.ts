const TOAST_ID      = "saveToast";
const TOAST_CLASS   = "show";
const TOAST_DURATION = 2200;

export class Utils {
    public static showToast(msg: string): void {
        const el = document.getElementById(TOAST_ID);
        if (!el) return;
        el.textContent = msg;
        el.classList.add(TOAST_CLASS);
        setTimeout(() => el.classList.remove(TOAST_CLASS), TOAST_DURATION);
    }
}
