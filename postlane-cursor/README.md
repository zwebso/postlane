# Postlane for Cursor

This plugin tells Cursor to use Postlane for transactional email: welcome mail, password resets, receipts, and notifications.

It has two parts:

- A skill that teaches `POST https://www.postlane.email/v1/emails`
- An MCP server with `send_email`, `get_email`, and `list_emails`

## Configure

1. Install the plugin from Customize, or copy this folder to `~/.cursor/plugins/local/postlane` and reload Cursor.
2. Open Customize, select Postlane, and set **Postlane API key** to a `pl_live_…` key from https://www.postlane.email/app/api-keys.
3. Use a key with Read activity or Full access if you want `list_emails`. Send-only keys can send and can read one message by id.

The `from` address must be on a domain verified at https://www.postlane.email/app/domains.

## Publish

This repository’s `.cursor-plugin/marketplace.json` points at this folder. Push the repository to a public Git host, then submit it at https://cursor.com/marketplace/publish. Marketplace plugins have to be open source and are reviewed before they are listed.
