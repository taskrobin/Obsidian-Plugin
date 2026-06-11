# TaskRobin Email Sync for Obsidian

Seamlessly sync your emails and attachments to your Obsidian vault with TaskRobin. This plugin helps you maintain a searchable archive of important emails directly within your Obsidian workspace. 7-day free trial available for all new users. Subscription plans start at $4.99/month.

## Features

-   📧 Email syncing to Obsidian vault
-   📎 Automatic attachment downloads
-   📁 Customizable storage directory
-   🔒 Secure email forwarding setup
-   🔄 On-demand sync functionality
-   📥 Integrate with multiple email inboxes

## Installation

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "TaskRobin"
4. Click Install
5. Enable the plugin in your Community Plugins list

## Setup

1. Open the TaskRobin plugin settings
2. Enter your email address
3. Create a forwarding email alias
4. Choose your preferred storage directory in your Obsidian
5. Configure attachment preferences

## Usage

### Initial Setup

1. Configure your email inbox to forward selected emails to your TaskRobin forwarding address
2. Emails will be automatically processed and will be saved to your specified Obsidian directory when you initiate sync
3. Upon plugin setup, you will start a 7-day free trial. No need any payment setup. If you like TaskRobin and would like to start a subscription, [find out more](http://app.taskrobin.io/pricing).

### Manual Sync

1. Click the TaskRobin icon in the Obsidian left side vertical panel
2. Click "Sync now" for each integration to manually trigger synchronization
3. New emails will be saved as markdown files in your designated folder, together with attachment files

### File Structure

Emails are saved with the following structure by default, a sub-folder will be created for each email message:

```
Your-Vault/
└── Emails/ # Default directory (configurable)
│ ├── YYYY-MM-DD-{email subject line}/ # Date-based folders
│ │ ├── email.md # Email content
│ │ ├── attachment1.pdf # Email attachments
│ │ └── attachment2.html # Email attachments
└── ...
```

Alternatively, you can also use a flat structure where all email markdown files are stored at the base directory, attachments are saved in sub-folders:

```
Your-Vault/
└── Emails/ # Default directory (configurable)
│ ├── attachments/
│ │ ├── YYYY-MM-DD-{email subject line} attachments/ # Date-based folders
│ │ │ ├── attachment1.pdf # Email attachments
│ │ │ ├── attachment2.html # Email attachments
│ ├── YYYY-MM-DD-{email subject line}.md # Email content
└── ...
```

## Configuration

| Setting               | Description                       | Default  |
| --------------------- | --------------------------------- | -------- |
| Email Address         | Your own email address            | -        |
| Forwarding Address    | Your TaskRobin forwarding address | -        |
| Vault Email Directory | Where emails are saved            | "Emails" |
| Download Attachments  | Whether to save attachments       | true     |

## Security

-   All files and communications are encrypted
-   All email processing happens through secure TaskRobin servers
-   No email credentials are stored in the plugin
-   All API communications use HTTPS

## Requirements

-   Obsidian v0.15.0 or higher
-   Active internet connection
-   Active TaskRobin account

## Support

-   Visit [TaskRobin.io](https://www.taskrobin.io) for documentation
-   [Live chat support](https://app.taskrobin.io)
-   Report issues on our [GitHub repository](https://github.com/taskrobin/Obsidian-Plugin)

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### 1.0.0

-   Initial release
-   Basic email sync functionality
-   Attachment support
-   Custom directory configuration

## Acknowledgments

-   Thanks to the Obsidian team for their excellent plugin API
-   All our beta testers and early adopters
-   The TaskRobin community for their feedback and support

---

For more information, visit [TaskRobin.io](https://www.taskrobin.io)
