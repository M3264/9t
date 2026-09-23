---
title: Use the workspace
description: Save files, notes, and links; find them later; and move them between devices.
---

# Use the workspace

Once 9t is running, open its address and sign in. **All items** is your private collection. You can save a file, snippet, or link there, then return to it from another signed-in device.

## Save something

Use **Quick capture** at the top of the workspace:

| What you have | What to do |
| --- | --- |
| A thought or piece of code | Type or paste it, then select **Save**. It becomes a snippet. |
| A web address | Paste the complete `http://` or `https://` URL, then select **Save**. It becomes a link. |
| A file | Drop it onto the file area, select **Browse files**, or paste an image into Quick capture. |

Quick capture names a snippet from its first line and a link from its hostname. Use **New item** when you want to set a name, language, or item type yourself. You can also choose how long the item stays: **Forever**, **1 hour**, **1 day**, or **7 days**. Your server's upload limit applies to files.

<Callout>

Saving an item keeps it on your 9t server. It does not publish the item or automatically share it with anyone.

</Callout>

## Find and organize it

The sidebar separates **All items**, **Snippets**, **Files**, **Links**, **Pinned**, **Shared links**, and **Trash**. The type views and Board appear only when their modules are enabled. On a phone-sized screen, the bottom bar and the scrollable filter row provide the same main views.

Search looks through item names, snippet text, and saved URLs **within the current view**. If a search in Files finds nothing, switch to All items and try again. Use the list/grid control and sort menu to change how the current collection appears.

Pin items you use often. The first three pinned items appear in **Within reach** on the All items view; **Pinned** shows the full set. If Board is enabled, you can drag items into positions there.

Open an item to rename it, edit a snippet or URL, change its expiry, share it, or delete it. Files can be downloaded; snippets have a copy action; links can open in a new tab.

## Continue on another device

Open the same 9t server address and sign in on the other device. An item's `/o/<id>` page also has a QR code that opens that **private** item page after sign-in. For automatic receiving and offline local history on Android, [install and pair the Android app](/docs/android/). Its native Inbox is separate from the full web workspace inside the app.

If a phone cannot open the server address at all, use the [network guide](/docs/network/) before troubleshooting pairing.

## Share with someone else

Open an item and select **Share**. Choose an expiry and, for anything sensitive, add a password. Copy the resulting `/s/` link. You can see access counts and revoke links under **Shared links**. These public links are different from the private `/o/` item pages; see [Sharing](/docs/sharing/) for the limits of short links.

## Delete or recover an item

Deleting moves an item to **Trash**. Restore it there before the retention period ends, or delete it permanently. An item's own expiry is separate: once it expires, the maintenance sweep removes it, so do not use a short lifetime for something you need to keep. The default Trash retention is seven days and can be changed in Settings.

## If something is missing

| Symptom | Check first |
| --- | --- |
| Saved item does not appear | Clear search, switch to **All items**, then check **Trash** and the item's expiry. |
| File upload fails | Check that Files is enabled in Settings and that the file is below this instance's upload limit. |
| A shared link stops opening | Check its expiry and whether it was revoked under **Shared links**. |
| Another device cannot reach 9t | Open the server address in that device's browser, then follow the [network checks](/docs/network/). |

## Save from a terminal

After [logging in with the CLI](/docs/operations/#cli-reference), you can use the same workspace without opening a browser:

```bash
9t push "Remember to send the draft"
9t push https://example.com/article
9t push ./notes.pdf
9t list
9t get <item-id>
```

`9t push` detects a local file path, an HTTP(S) URL, or plain text. See [Operations](/docs/operations/) for the full command list.
