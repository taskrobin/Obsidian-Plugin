import { App, Notice } from "obsidian";
import { syncEmails } from "./api";
import {
	EmailFolderStructure,
	Integration,
	TaskRobinPluginSettings,
} from "./types";
import { formatEmailFolderName, sanitizeFileName } from "./utils";

/**
 * Get the access token for a specific origin email
 * @param settings The plugin settings
 * @param originEmail The origin email to get the access token for
 * @returns The access token for the origin email, or empty string if not found
 */
export function getAccessTokenForEmail(
	settings: TaskRobinPluginSettings,
	originEmail: string,
): string {
	// Look for a matching EmailAuth entry
	const auth = settings.emailAuths.find(
		(auth) => auth.originEmail === originEmail,
	);

	// Return the token if found, otherwise return empty string
	return auth?.accessToken || "";
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
	saveSettings: () => Promise<void>,
): Promise<void> {
	// Look for a matching EmailAuth entry
	let auth = settings.emailAuths.find(
		(auth) => auth.originEmail === originEmail,
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
	integration: Integration,
): Promise<void> {
	try {
		// Use the integration-specific settings
		const emailAddress = integration.originEmail;
		const rootDirectory = integration.rootDirectory;

		// Get the folder structure option from the integration settings
		// Default to FolderPerEmail if not specified
		const folderStructure =
			integration.obsidianEmailFolderStructure ||
			EmailFolderStructure.FolderPerEmail;

		// Ensure the root directory exists, create it if it doesn't
		const rootDirectoryExists =
			(await app.vault.getAbstractFileByPath(rootDirectory)) !== null;
		if (!rootDirectoryExists) {
			await app.vault.createFolder(rootDirectory);
		}

		new Notice(`Syncing emails for ${emailAddress}...`);
		// Get the access token for this email address
		const accessToken = getAccessTokenForEmail(settings, emailAddress);
		const data = await syncEmails(
			emailAddress,
			accessToken,
			integration.forwardingEmailAlias,
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
				const downloadedFiles: Map<string, string> = new Map(); // originalFileName -> finalFileName

				// Helper to find final filename in downloadedFiles (fuzzy match for timestamps)
				const getFinalFileName = (searchName: string) => {
					const trimmed = searchName.trim().toLowerCase();
					// Try exact match first
					for (const [orig, final] of downloadedFiles.entries()) {
						if (orig.toLowerCase() === trimmed) return final;
					}

					// Fuzzy match for timestamps/prefixes: 
					// "Test inline image.png" should match "Test-attachment-image_12345.png"
					const searchParts = trimmed.split(".");
					const searchExt =
						searchParts.length > 1 ? searchParts.pop() : "";
					// Normalize base: replace spaces, dashes, underscores with single space
					const normalize = (s: string) => s.replace(/[-_ ]+/g, " ").trim();
					const searchBase = normalize(searchParts.join("."));

					for (const [orig, final] of downloadedFiles.entries()) {
						const origLower = orig.toLowerCase();
						const origParts = origLower.split(".");
						const origExt =
							origParts.length > 1 ? origParts.pop() : "";
						const origBase = normalize(origParts.join("."));

						if (searchExt === origExt || searchExt === "") {
							if (
								origBase.includes(searchBase) ||
								searchBase.includes(origBase)
							) {
								return final;
							}
						}
					}
					return null;
				};

				if (folderStructure === EmailFolderStructure.FolderPerEmail) {
					// Create folder per email
					const emailFolderPath = `${rootDirectory}/${folderName}`;
					const folderExists =
						(await app.vault.getAbstractFileByPath(
							emailFolderPath,
						)) !== null;
					if (!folderExists) {
						await app.vault.createFolder(emailFolderPath);
					}

					let mainEmailFile: {
						fileName: string;
						fileUrl: string;
						content?: string;
					} | null = null;

					const downloadPromises = Object.entries(files).map(
						async ([fileName, fileUrl]) => {
							const isMainEmail =
								fileName.endsWith(".md") &&
								fileName.startsWith("email-");

							// Prefix markdown files (except the main email) with subject
							const vaultFileName =
								fileName.endsWith(".md") &&
								subject &&
								!isMainEmail
									? `${subject}-${fileName}`
									: fileName;
							const finalFileName =
								sanitizeFileName(vaultFileName);
							downloadedFiles.set(fileName, finalFileName);

							// If downloadAttachments is disabled, only process the main email message file
							if (!settings.downloadAttachments && !isMainEmail) {
								return; // Skip this file
							}

							try {
								const finalFilePath = `${emailFolderPath}/${finalFileName}`;

								if (isMainEmail) {
									const fileResponse = await fetch(fileUrl);
									if (!fileResponse.ok)
										throw new Error(
											`Failed to fetch main email: ${fileResponse.status}`,
										);
									const content = await fileResponse.text();
									mainEmailFile = {
										fileName,
										fileUrl,
										content,
									};
									return;
								}

								const finalFilePathExists =
									(await app.vault.getAbstractFileByPath(
										finalFilePath,
									)) !== null;

								if (!finalFilePathExists) {
									const fileResponse = await fetch(fileUrl, {
										mode: "cors",
										credentials: "omit",
									});
									if (!fileResponse.ok) {
										throw new Error(
											`Failed to download ${fileName}: ${fileResponse.status} ${fileResponse.statusText}`,
										);
									}
									const fileData =
										await fileResponse.arrayBuffer();
									await app.vault.createBinary(
										finalFilePath,
										fileData,
									);
								}
							} catch (error) {
								console.error(
									`Error downloading file ${fileName}:`,
									error,
								);
								new Notice(
									`Failed to download file: ${fileName}`,
								);
							}
						},
					);

					await Promise.all(downloadPromises);

					// Process and save the main email file after all attachments are tracked
					const finalMainEmailFile = mainEmailFile as {
						fileName: string;
						fileUrl: string;
						content?: string;
					} | null;
					if (finalMainEmailFile && finalMainEmailFile.content) {
						let updatedContent = finalMainEmailFile.content;

						// 1. Replace [image: filename] with ![[filename]]
						updatedContent = updatedContent.replace(
							/\[image:\s*(.*?)\]/gi,
							(match: string, fileName: string) => {
								const finalName = getFinalFileName(fileName);
								if (finalName) {
									return `![[${finalName}]]`;
								}
								return match;
							},
						);

						// 2. Replace attachment links with [[filename]]
						updatedContent = updatedContent.replace(
							/\[(.*?)\]\((.*?)\)/g,
							(match: string, linkText: string, url: string) => {
								const finalName = getFinalFileName(linkText);
								if (finalName) {
									return `[[${finalName}]]`;
								}
								return match;
							},
						);

						const prefix = settings.prefixMainEmailFile ? "!" : "";
						const finalFileName = sanitizeFileName(
							subject
								? `${prefix}${subject}-${finalMainEmailFile.fileName}`
								: `${prefix}${finalMainEmailFile.fileName}`,
						);
						const finalFilePath = `${emailFolderPath}/${finalFileName}`;
						const finalFilePathExists =
							(await app.vault.getAbstractFileByPath(
								finalFilePath,
							)) !== null;

						if (!finalFilePathExists) {
							await app.vault.createBinary(
								finalFilePath,
								new TextEncoder().encode(updatedContent),
							);
						}
					}

					new Notice(`Email files saved in ${emailFolderPath}`);
				} else {
					// Markdown files in root, attachments in folders
					let mainEmailFile: {
						fileName: string;
						fileUrl: string;
						content?: string;
					} | null = null;

					const downloadPromises = Object.entries(files).map(
						async ([fileName, fileUrl]) => {
							try {
								const isMainEmail =
									fileName.endsWith(".md") &&
									fileName.startsWith("email-");

								const vaultFileName =
									fileName.endsWith(".md") &&
									subject &&
									!isMainEmail
										? `${subject}-${fileName}`
										: fileName;
								const finalFileName =
									sanitizeFileName(vaultFileName);
								downloadedFiles.set(fileName, finalFileName);

								if (isMainEmail) {
									const fileResponse = await fetch(fileUrl);
									if (!fileResponse.ok)
										throw new Error(
											`Failed to fetch main email: ${fileResponse.status}`,
										);
									const content = await fileResponse.text();
									mainEmailFile = {
										fileName,
										fileUrl,
										content,
									};
								} else {
									// This is another markdown file or an attachment
									// Skip if downloadAttachments is disabled
									if (!settings.downloadAttachments) {
										return; // Skip this file
									}

									// Save it in the attachment folder
									// First, ensure the root attachments folder exists
									const rootAttachmentsPath = `${rootDirectory}/attachments`;
									const rootAttachmentsFolderExists =
										(await app.vault.getAbstractFileByPath(
											rootAttachmentsPath,
										)) !== null;
									if (!rootAttachmentsFolderExists) {
										await app.vault.createFolder(
											rootAttachmentsPath,
										);
									}

									// Create a subfolder for this email's attachments
									const attachmentFolderName = `${folderName} attachments`;
									const attachmentFolderPath = `${rootAttachmentsPath}/${attachmentFolderName}`;

									// Check if the email's attachment folder exists, create it if it doesn't
									const folderExists =
										(await app.vault.getAbstractFileByPath(
											attachmentFolderPath,
										)) !== null;
									if (!folderExists) {
										await app.vault.createFolder(
											attachmentFolderPath,
										);
									}

									// Save the file in the email's attachment folder
									const finalFilePath = `${attachmentFolderPath}/${finalFileName}`;
									const finalFilePathExists =
										(await app.vault.getAbstractFileByPath(
											finalFilePath,
											// @ts-ignore
										)) !== null;

									if (!finalFilePathExists) {
										const fileResponse = await fetch(
											fileUrl,
											{
												mode: "cors",
												credentials: "omit",
											},
										);
										if (!fileResponse.ok) {
											throw new Error(
												`Failed to download ${fileName}: ${fileResponse.status} ${fileResponse.statusText}`,
											);
										}
										const fileData =
											await fileResponse.arrayBuffer();
										await app.vault.createBinary(
											finalFilePath,
											fileData,
										);
									}
								}
							} catch (error) {
								console.error(
									`Error downloading file ${fileName}:`,
									error,
								);
								new Notice(
									`Failed to download file: ${fileName}`,
								);
							}
						},
					);

					await Promise.all(downloadPromises);

					// Process and save the main email file
					const finalMainEmailFile = mainEmailFile as {
						fileName: string;
						fileUrl: string;
						content?: string;
					} | null;
					if (finalMainEmailFile && finalMainEmailFile.content) {
						let updatedContent = finalMainEmailFile.content;
						const attachmentFolderName = `${folderName} attachments`;

						// 1. Replace [image: filename] with ![[attachments/folder attachments/filename]]
						updatedContent = updatedContent.replace(
							/\[image:\s*(.*?)\]/gi,
							(match: string, fileName: string) => {
								const finalName = getFinalFileName(fileName);
								if (finalName) {
									return `![[attachments/${attachmentFolderName}/${finalName}]]`;
								}
								return match;
							},
						);

						// 2. Replace attachment links with [[attachments/folder attachments/filename]]
						updatedContent = updatedContent.replace(
							/\[(.*?)\]\((.*?)\)/g,
							(match: string, linkText: string, url: string) => {
								const finalName = getFinalFileName(linkText);
								if (finalName) {
									return `[[attachments/${attachmentFolderName}/${finalName}]]`;
								}
								return match;
							},
						);

						const finalFilePath = `${rootDirectory}/${folderName}.md`;
						const finalFilePathExists =
							(await app.vault.getAbstractFileByPath(
								finalFilePath,
							)) !== null;

						if (!finalFilePathExists) {
							await app.vault.createBinary(
								finalFilePath,
								new TextEncoder().encode(updatedContent),
							);
						}
					}

					new Notice(`Email files saved in ${rootDirectory}`);
				}
			}
		}
		new Notice(`Email sync completed!`);
	} catch (error) {
		console.error("Sync error:", error);
		new Notice("Failed to sync. Check console for details.");
		throw error;
	}
}
