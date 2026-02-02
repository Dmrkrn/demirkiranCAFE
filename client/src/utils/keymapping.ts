/**
 * Key Mapping Utility for uIOhook
 * Maps DOM KeyboardEvent.code (e.g., 'KeyM', 'Space') to uIOhook keycodes.
 */

// uIOhook keycodes (based on standard values)
export const UIOhookKey = {
    VC_ESCAPE: 1,
    VC_1: 2,
    VC_2: 3,
    VC_3: 4,
    VC_4: 5,
    VC_5: 6,
    VC_6: 7,
    VC_7: 8,
    VC_8: 9,
    VC_9: 10,
    VC_0: 11,
    VC_MINUS: 12,
    VC_EQUALS: 13,
    VC_BACKSPACE: 14,
    VC_TAB: 15,
    VC_Q: 16,
    VC_W: 17,
    VC_E: 18,
    VC_R: 19,
    VC_T: 20,
    VC_Y: 21,
    VC_U: 22,
    VC_I: 23,
    VC_O: 24,
    VC_P: 25,
    VC_OPEN_BRACKET: 26,
    VC_CLOSE_BRACKET: 27,
    VC_ENTER: 28,
    VC_CONTROL_L: 29,
    VC_A: 30,
    VC_S: 31,
    VC_D: 32,
    VC_F: 33,
    VC_G: 34,
    VC_H: 35,
    VC_J: 36,
    VC_K: 37,
    VC_L: 38,
    VC_SEMICOLON: 39,
    VC_QUOTE: 40,
    VC_BACK_QUOTE: 41,
    VC_SHIFT_L: 42,
    VC_BACK_SLASH: 43,
    VC_Z: 44,
    VC_X: 45,
    VC_C: 46,
    VC_V: 47,
    VC_B: 48,
    VC_N: 49,
    VC_M: 50,
    VC_COMMA: 51,
    VC_PERIOD: 52,
    VC_SLASH: 53,
    VC_SHIFT_R: 54,
    VC_KP_MULTIPLY: 55,
    VC_ALT_L: 56,
    VC_SPACE: 57,
    VC_CAPS_LOCK: 58,
    VC_F1: 59,
    VC_F2: 60,
    VC_F3: 61,
    VC_F4: 62,
    VC_F5: 63,
    VC_F6: 64,
    VC_F7: 65,
    VC_F8: 66,
    VC_F9: 67,
    VC_F10: 68,
    VC_NUM_LOCK: 69,
    VC_SCROLL_LOCK: 70,
    VC_KP_7: 71,
    VC_KP_8: 72,
    VC_KP_9: 73,
    VC_KP_SUBTRACT: 74,
    VC_KP_4: 75,
    VC_KP_5: 76,
    VC_KP_6: 77,
    VC_KP_ADD: 78,
    VC_KP_1: 79,
    VC_KP_2: 80,
    VC_KP_3: 81,
    VC_KP_0: 82,
    VC_KP_SEPARATOR: 83,
    VC_F11: 87,
    VC_F12: 88,
    VC_F13: 91,
    VC_F14: 92,
    VC_F15: 93,
    VC_F16: 99,
    VC_F17: 100,
    VC_F18: 101,
    VC_F19: 102,
    VC_F20: 103,
    VC_F21: 104,
    VC_F22: 105,
    VC_F23: 106,
    VC_F24: 107,
    VC_KP_COMMA: 147, /* japanese? */
    VC_KP_ENTER: 3612,
    VC_CONTROL_R: 3613,
    VC_KP_DIVIDE: 3637,
    VC_PRINT_SCREEN: 3639,
    VC_ALT_R: 3640,
    VC_HOME: 3655,
    VC_UP: 57416,
    VC_PAGE_UP: 3657,
    VC_LEFT: 57419,
    VC_RIGHT: 57421,
    VC_END: 3663,
    VC_DOWN: 57424,
    VC_PAGE_DOWN: 3665,
    VC_INSERT: 3666,
    VC_DELETE: 3667,
    VC_META_L: 3675,
    VC_META_R: 3676,
    VC_APP_CONTEXT: 3677,
} as const;

export const mapDomCodeToUiohook = (code: string): number | null => {
    switch (code) {
        // Letters
        case 'KeyA': return UIOhookKey.VC_A;
        case 'KeyB': return UIOhookKey.VC_B;
        case 'KeyC': return UIOhookKey.VC_C;
        case 'KeyD': return UIOhookKey.VC_D;
        case 'KeyE': return UIOhookKey.VC_E;
        case 'KeyF': return UIOhookKey.VC_F;
        case 'KeyG': return UIOhookKey.VC_G;
        case 'KeyH': return UIOhookKey.VC_H;
        case 'KeyI': return UIOhookKey.VC_I;
        case 'KeyJ': return UIOhookKey.VC_J;
        case 'KeyK': return UIOhookKey.VC_K;
        case 'KeyL': return UIOhookKey.VC_L;
        case 'KeyM': return UIOhookKey.VC_M;
        case 'KeyN': return UIOhookKey.VC_N;
        case 'KeyO': return UIOhookKey.VC_O;
        case 'KeyP': return UIOhookKey.VC_P;
        case 'KeyQ': return UIOhookKey.VC_Q;
        case 'KeyR': return UIOhookKey.VC_R;
        case 'KeyS': return UIOhookKey.VC_S;
        case 'KeyT': return UIOhookKey.VC_T;
        case 'KeyU': return UIOhookKey.VC_U;
        case 'KeyV': return UIOhookKey.VC_V;
        case 'KeyW': return UIOhookKey.VC_W;
        case 'KeyX': return UIOhookKey.VC_X;
        case 'KeyY': return UIOhookKey.VC_Y;
        case 'KeyZ': return UIOhookKey.VC_Z;

        // Digits
        case 'Digit1': return UIOhookKey.VC_1;
        case 'Digit2': return UIOhookKey.VC_2;
        case 'Digit3': return UIOhookKey.VC_3;
        case 'Digit4': return UIOhookKey.VC_4;
        case 'Digit5': return UIOhookKey.VC_5;
        case 'Digit6': return UIOhookKey.VC_6;
        case 'Digit7': return UIOhookKey.VC_7;
        case 'Digit8': return UIOhookKey.VC_8;
        case 'Digit9': return UIOhookKey.VC_9;
        case 'Digit0': return UIOhookKey.VC_0;

        // F-Keys
        case 'F1': return UIOhookKey.VC_F1;
        case 'F2': return UIOhookKey.VC_F2;
        case 'F3': return UIOhookKey.VC_F3;
        case 'F4': return UIOhookKey.VC_F4;
        case 'F5': return UIOhookKey.VC_F5;
        case 'F6': return UIOhookKey.VC_F6;
        case 'F7': return UIOhookKey.VC_F7;
        case 'F8': return UIOhookKey.VC_F8;
        case 'F9': return UIOhookKey.VC_F9;
        case 'F10': return UIOhookKey.VC_F10;
        case 'F11': return UIOhookKey.VC_F11;
        case 'F12': return UIOhookKey.VC_F12;

        // Modifiers & Others
        case 'Space': return UIOhookKey.VC_SPACE;
        case 'Enter': return UIOhookKey.VC_ENTER;
        case 'Escape': return UIOhookKey.VC_ESCAPE;
        case 'Tab': return UIOhookKey.VC_TAB;
        case 'ControlLeft': return UIOhookKey.VC_CONTROL_L;
        case 'ControlRight': return UIOhookKey.VC_CONTROL_R;
        case 'ShiftLeft': return UIOhookKey.VC_SHIFT_L;
        case 'ShiftRight': return UIOhookKey.VC_SHIFT_R;
        case 'AltLeft': return UIOhookKey.VC_ALT_L;
        case 'AltRight': return UIOhookKey.VC_ALT_R;
        case 'MetaLeft': return UIOhookKey.VC_META_L;
        case 'MetaRight': return UIOhookKey.VC_META_R;
        case 'ArrowUp': return UIOhookKey.VC_UP;
        case 'ArrowDown': return UIOhookKey.VC_DOWN;
        case 'ArrowLeft': return UIOhookKey.VC_LEFT;
        case 'ArrowRight': return UIOhookKey.VC_RIGHT;
        case 'Backquote': return UIOhookKey.VC_BACK_QUOTE;
        case 'Minus': return UIOhookKey.VC_MINUS;
        case 'Equal': return UIOhookKey.VC_EQUALS;
        case 'BracketLeft': return UIOhookKey.VC_OPEN_BRACKET;
        case 'BracketRight': return UIOhookKey.VC_CLOSE_BRACKET;
        case 'Backslash': return UIOhookKey.VC_BACK_SLASH;
        case 'Semicolon': return UIOhookKey.VC_SEMICOLON;
        case 'Quote': return UIOhookKey.VC_QUOTE;
        case 'Comma': return UIOhookKey.VC_COMMA;
        case 'Period': return UIOhookKey.VC_PERIOD;
        case 'Slash': return UIOhookKey.VC_SLASH;
        case 'Backspace': return UIOhookKey.VC_BACKSPACE;
        case 'Delete': return UIOhookKey.VC_DELETE;

        default: return null;
    }
};
