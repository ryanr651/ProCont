

## Problem

Lines 1045-1046 have a duplicate `} else {`:
```
1045:         } else {
1046:          } else {
```

This causes all 4 build errors (mismatched braces/catch/finally). The fix from the previous edit left a stale `} else {` on line 1045.

## Fix

Remove line 1045 (`} else {`) — it's the leftover from the old code. Line 1046's `} else {` is the correct one that starts the content slides block the user pasted.

**Single edit**: Delete line 1045, keeping lines 1046 onward intact.

