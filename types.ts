export interface Integration {
	forwardingEmailAlias: string;
	rootDirectory: string;
	originEmail: string;
	obsidianEmailFolderStructure?: EmailFolderStructure;
}

export const EmailFolderStructure = {
	FolderPerEmail: "folder_per_email",
	FlatAttachmentInFolder: "flat_attachments_in_folder",
} as const;

export type EmailFolderStructure =
	(typeof EmailFolderStructure)[keyof typeof EmailFolderStructure];

export interface EmailAuth {
	originEmail: string;
	accessToken: string;
}

export interface TaskRobinPluginSettings {
	hasWelcomedUser: boolean;
	rootDirectory: string;
	downloadAttachments: boolean;
	syncOnLaunch: boolean;
	prefixMainEmailFile: boolean;

	// Fields for multiple integrations
	integrations: Integration[];

	// Field for email authentication
	emailAuths: EmailAuth[];

	// Optional default email for convenience when creating new integrations
	defaultEmailAddress?: string;

	// Datetime format and timezone settings
	datetimeFormat?: string;
	timezone?: string;
}

export interface SyncResponse {
	emails: Array<{
		[key: string]: {
			[key: string]: string;
		};
	}>;
}
