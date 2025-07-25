import { App, Notice } from "obsidian";
import { syncEmails } from "./api";
import { Integration, TaskRobinPluginSettings } from "./types";
import { formatEmailFolderName, sanitizeFileName } from "./utils";

/**
 * Get the access token for a specific origin email
 * @param settings The plugin settings
 * @param originEmail The origin email to get the access token for
 * @returns The access token for the origin email, or the legacy access token if not found
 */
export function getAccessTokenForEmail(
	settings: TaskRobinPluginSettings,
	originEmail: string
): string {
	// Look for a matching EmailAuth entry
	const auth = settings.emailAuths.find(
		(auth) => auth.originEmail === originEmail
	);

	// Return the token if found, otherwise fall back to the legacy token
	return auth?.accessToken || settings.accessToken;
}

/**
 * Set the access token for a specific origin email
 * @param settings The plugin settings
 * @param originEmail The origin email to set the access token for
 * @param accessToken The access token to set
 * @param saveSettings Function to save the settings
 */
export async function setAccessTokenForEmail(
	settings: TaskRobinPluginSettings,
	originEmail: string,
	accessToken: string,
	saveSettings: () => Promise<void>
): Promise<void> {
	// Look for a matching EmailAuth entry
	let auth = settings.emailAuths.find(
		(auth) => auth.originEmail === originEmail
	);

	if (auth) {
		// Update existing auth
		auth.accessToken = accessToken;
	} else {
		// Create new auth entry
		settings.emailAuths.push({
			originEmail: originEmail,
			accessToken: accessToken,
		});
	}

	// Save settings
	await saveSettings();
}

export async function performEmailSync(
	app: App,
	settings: TaskRobinPluginSettings,
	integration?: Integration
): Promise<void> {
	try {
		// Use the integration-specific originEmail and rootDirectory if provided
		// Otherwise fall back to the global emailAddress and rootDirectory
		const emailAddress = integration?.originEmail || settings.emailAddress;
		const rootDirectory = integration
			? integration.rootDirectory
			: settings.rootDirectory;

		new Notice(`Syncing emails for ${emailAddress}...`);
		// Get the access token for this email address
		const accessToken = getAccessTokenForEmail(settings, emailAddress);
		const data = await syncEmails(
			emailAddress,
			accessToken,
			integration?.forwardingEmailAlias
		);

		for (const emailGroup of data.emails) {
			for (const [emailId, files] of Object.entries(emailGroup)) {
				let subject = "";
				for (const [fileName, fileUrl] of Object.entries(files)) {
					if (fileName.endsWith(".md")) {
						const response = await fetch(fileUrl);
						const content = await response.text();
						const subjectMatch = content.match(/^Subject: (.+)$/m);
						if (subjectMatch) {
							subject = subjectMatch[1].trim();
							break;
						}
					}
				}

				const folderName = formatEmailFolderName(emailId, subject);
				const emailFolderPath = `${rootDirectory}/${folderName}`;
				const folderExists =
					(await app.vault.getAbstractFileByPath(emailFolderPath)) !==
					null;
				if (!folderExists) {
					await app.vault.createFolder(emailFolderPath);
				}

				const downloadPromises = Object.entries(files).map(
					async ([fileName, fileUrl]) => {
						try {
							const mdFileName =
								fileName.endsWith(".md") && subject
									? `${subject}-${fileName}`
									: fileName;
							const finalFileName = sanitizeFileName(mdFileName);
							const finalFilePath = `${emailFolderPath}/${finalFileName}`;
							const finalFilePathExists =
								(await app.vault.getAbstractFileByPath(
									finalFilePath
								)) !== null;

							if (!finalFilePathExists) {
								const fileResponse = await fetch(fileUrl, {
									mode: "cors",
									credentials: "omit",
								});
								if (!fileResponse.ok) {
									throw new Error(
										`Failed to download ${fileName}: ${fileResponse.status} ${fileResponse.statusText}`
									);
								}
								const fileData =
									await fileResponse.arrayBuffer();
								await app.vault.createBinary(
									finalFilePath,
									fileData
								);
							}
						} catch (error) {
							console.error(
								`Error downloading file ${fileName}:`,
								error
							);
							new Notice(`Failed to download file: ${fileName}`);
						}
					}
				);

				await Promise.all(downloadPromises);
				new Notice(`Email files saved in ${emailFolderPath}`);
			}
		}
		new Notice(`Email sync completed!`);
	} catch (error) {
		console.error("Sync error:", error);
		new Notice("Failed to sync. Check console for details.");
		throw error;
	}
}
