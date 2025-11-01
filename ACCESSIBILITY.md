# Accessibility Guide

This document summarizes the accessibility improvements in SpotOn and how to use them effectively, especially with screen readers and keyboard-only navigation.

## Global Navigation

- **Skip Link**: Every page now includes a “Skip to main content” link that appears when you press `Tab` on page load. It allows keyboard and screen-reader users to bypass navigation.
- **Semantic Regions**: Primary sections such as Discover, Onboarding, and Settings use `<main>` with `aria-label`s so assistive technologies can identify page content quickly.

## Discover Page

- **Live Updates**: Discovery progress reports use polite live regions to announce scraping steps and event counts. The event feed announces how many cards are available and which card is focused.
- **Card Controls**: Swipeable cards behave as accessible articles:
  - `Right Arrow` / `D`: Save the current event
  - `Left Arrow` / `A`: Dismiss the current event
  - `Enter` / `Space`: Open the details dialog
  - `Double-click`: Open the details dialog (useful for screen readers that simulate double-tap)
  - Buttons under the deck expose the same actions with `aria-label`s
- **Status Panel**: The scraped-sites list is read as a region with status badges and detailed entries for screen readers.

## Event Detail Dialog

- Provided with `aria-labelledby` and a hidden description to announce what information is available.
- Vibes and interests are output as lists so the relationships are clear when spoken.

## Onboarding & Settings Forms

- **Fieldsets & Legends**: Interests, vibes, and email frequency options are grouped with legends so screen readers describe each question properly.
- **Toggle Buttons**: Option chips act as toggle buttons with `aria-pressed` and visible focus styles.
- **Live Counts**: Hidden live regions announce the number of selected interests and vibes.
- **Custom Values**: “Add custom interest/vibe” inputs expose labels and instructions; added items can be removed with a simple button.
- **Email Frequency**: Converted to real radio buttons for predictable screen-reader behavior.

## Other Enhancements

- **Focus Management**: The discover page auto-focuses the current card and restores focus after closing the detail dialog.
- **Status Announcements**: Loading states, background discoveries, and scraper results use polite live regions to notify without hijacking focus.
- **Icon Accessibility**: Decorative icons are hidden with `aria-hidden="true"`; button labels describe the action explicitly.

## Screen-Reader Tips

### macOS VoiceOver
1. Enable VoiceOver with `⌘ + F5`.
2. Use `Ctrl + Option + →`/`←` to navigate elements.
3. Activate controls with `Ctrl + Option + Space`.
4. When focused on the swipe deck, use the arrow keys as described above.

### Windows NVDA
1. Launch NVDA and press `Insert + Space` to switch between browse and focus modes if needed.
2. Use `Tab` and arrow keys to move through controls.
3. Activate with `Enter` or spacebar.

## Keyboard Cheat Sheet

| Action | Shortcut |
| --- | --- |
| Skip navigation | `Tab` at page start |
| Save event | `Right Arrow`, `D`, or Save button |
| Dismiss event | `Left Arrow`, `A`, or Remove button |
| Undo last action | Undo button (Shift + Tab from Save) |
| Open details | `Enter`, `Space`, or double-click |
| Close dialog | `Escape` or dialog close button |

## Testing Checklist

- Navigate each page using only the keyboard.
- Confirm the skip link works and focus states are visible.
- Use a screen reader to ensure announcements occur in Discover and forms.
- Verify that buttons and chips describe their state (`selected`, `not selected`).

## Known Considerations

- Brave/OpenAI API responses dictate content; some announcements depend on network status.
- The discovery deck focuses the first card; if the deck is empty, the app announces the status but focus returns to the discover section controls.

For accessibility feedback or bug reports, please file an issue or contact the team directly.

