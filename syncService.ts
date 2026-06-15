import { App, Notice } from "obsidian";
import { syncEmails } from "./api";
import {
	EmailFolderStructure,
	Integration,
	TaskRobinPluginSettings,
} from "./types";
import {
	formatEmailFolderName,
	replaceFilenameTimestamp,
	sanitizeFileName,
	formatTimestamp,
} from "./utils";

/**
 * Normalizes URLs by stripping query parameters and decoding encoded characters.
 */
export function normalizeUrl(url: string): string {
    try {
        return decodeURIComponent(new URL(url).pathname);
    } catch (e) {
        // Fallback if it's not a valid URL
        return decodeURIComponent(url.split("?")[0]);
    }
}

/**
 * Generates a unique file path by appending a suffix if the file already exists.
 * @param app The Obsidian app instance
 * @param targetPath The desired path for the file
 * @returns A unique path for the file
 */
async function getUniqueFilePath(
	app: App,
	targetPath: string,
): Promise<string> {
	let uniquePath = targetPath;
	let counter = 1;

	const parts = targetPath.split(".");
	const extension = parts.length > 1 ? `.${parts.pop()}` : "";
	const baseName = parts.join(".");

	while ((await app.vault.getAbstractFileByPath(uniquePath)) !== null) {
		uniquePath = `${baseName}_${counter}${extension}`;
		counter++;
	}

	return uniquePath;
}

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
	const auth = settings.emailAuths.find(
		(auth) => auth.originEmail === originEmail,
	);
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
	let auth = settings.emailAuths.find(
		(auth) => auth.originEmail === originEmail,
	);

	if (auth) {
		auth.accessToken = accessToken;
	} else {
		settings.emailAuths.push({
			originEmail: originEmail,
			accessToken: accessToken,
		});
	}
	await saveSettings();
}

export async function performEmailSync(
	app: App,
	settings: TaskRobinPluginSettings,
	integration: Integration,
): Promise<void> {
	try {
		const emailAddress = integration.originEmail;
		const rootDirectory = integration.rootDirectory;

		const folderStructure =
			integration.obsidianEmailFolderStructure ||
			EmailFolderStructure.FolderPerEmail;

		const rootDirectoryExists =
			(await app.vault.getAbstractFileByPath(rootDirectory)) !== null;
		if (!rootDirectoryExists) {
			await app.vault.createFolder(rootDirectory);
		}

		new Notice(`Syncing emails for ${emailAddress}...`);
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

				const folderName = formatEmailFolderName(emailId, subject, settings);
				const urlToLocalFileName: Map<string, string> = new Map(); // normalizedFileUrl -> finalFileName

				if (folderStructure === EmailFolderStructure.FolderPerEmail) {
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

					for (const [fileName, fileUrl] of Object.entries(files)) {
						const isMainEmail =
							fileName.endsWith(".md") &&
							fileName.startsWith("email-");

						const processedFileName = replaceFilenameTimestamp(
							fileName,
							settings,
						);
						const vaultFileName =
							processedFileName.endsWith(".md") &&
							subject &&
							!isMainEmail
								? `${subject}-${processedFileName}`
								: processedFileName;
						const finalFileName = sanitizeFileName(vaultFileName);

						if (!settings.downloadAttachments && !isMainEmail) {
							continue;
						}

						try {
							const initialFilePath = `${emailFolderPath}/${finalFileName}`;
							const finalFilePath = await getUniqueFilePath(
								app,
								initialFilePath,
							);
							const uniqueFinalFileName =
								finalFilePath.split("/").pop() || finalFileName;

							urlToLocalFileName.set(normalizeUrl(fileUrl), uniqueFinalFileName);

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
								continue;
							}

							const fileResponse = await fetch(fileUrl, {
								mode: "cors",
								credentials: "omit",
							});
							if (!fileResponse.ok) {
								throw new Error(
									`Failed to download ${fileName}: ${fileResponse.status} ${fileResponse.statusText}`,
								);
							}
							const fileData = await fileResponse.arrayBuffer();
							await app.vault.createBinary(finalFilePath, fileData);
						} catch (error) {
							console.error(
								`Error downloading file ${fileName}:`,
								error,
							);
							new Notice(`Failed to download file: ${fileName}`);
						}
					}

					if (mainEmailFile && mainEmailFile.content) {
						console.log(`[TaskRobin] Mapping dump:`, Array.from(urlToLocalFileName.entries()));
						let updatedContent = processContentLinks(
							mainEmailFile.content,
							(url) => urlToLocalFileName.get(normalizeUrl(url)) || null,
						);

						const prefix = settings.prefixMainEmailFile ? "!" : "";
						const processedMainFileName = replaceFilenameTimestamp(
							mainEmailFile.fileName,
							settings,
						);
						const finalFileName = sanitizeFileName(
							subject
								? `${prefix}${subject}-${processedMainFileName}`
								: `${prefix}${processedMainFileName}`,
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
					let mainEmailFile: {
						fileName: string;
						fileUrl: string;
						content?: string;
					} | null = null;

					for (const [fileName, fileUrl] of Object.entries(files)) {
						try {
							const isMainEmail =
								fileName.endsWith(".md") &&
								fileName.startsWith("email-");

							const processedFileName =
								replaceFilenameTimestamp(
									fileName,
									settings,
								);

							const vaultFileName =
								processedFileName.endsWith(".md") &&
								subject &&
								!isMainEmail
									? `${subject}-${processedFileName}`
									: processedFileName;
							const finalFileName =
								sanitizeFileName(vaultFileName);

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
								const initialFilePath = `${rootDirectory}/${finalFileName}`;
								const finalFilePath = await getUniqueFilePath(
									app,
									initialFilePath,
								);
								const uniqueFinalFileName =
									finalFilePath.split("/").pop() || finalFileName;

								urlToLocalFileName.set(normalizeUrl(fileUrl), uniqueFinalFileName);
							} else {
								if (!settings.downloadAttachments) {
									continue;
								}

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

								const attachmentFolderName = `${folderName} attachments`;
								const attachmentFolderPath = `${rootAttachmentsPath}/${attachmentFolderName}`;

								const folderExists =
									(await app.vault.getAbstractFileByPath(
										attachmentFolderPath,
									)) !== null;
								if (!folderExists) {
									await app.vault.createFolder(
										attachmentFolderPath,
									);
								}

								const initialFilePath = `${attachmentFolderPath}/${finalFileName}`;
								const finalFilePath = await getUniqueFilePath(
									app,
									initialFilePath,
								);
								const uniqueFinalFileName =
									finalFilePath.split("/").pop() ||
									finalFileName;

								urlToLocalFileName.set(normalizeUrl(fileUrl), uniqueFinalFileName);

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
					}

					if (mainEmailFile && mainEmailFile.content) {
						let updatedContent = mainEmailFile.content;
						const attachmentFolderName = `${folderName} attachments`;

						updatedContent = processContentLinks(
							updatedContent,
							(url) => urlToLocalFileName.get(normalizeUrl(url)) || null,
							`attachments/${attachmentFolderName}/`,
						);

						const processedMainFileName = replaceFilenameTimestamp(
							mainEmailFile.fileName,
							settings,
						);
						const finalFilePath = `${rootDirectory}/${sanitizeFileName(
							processedMainFileName,
						)}`;
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

/**
 * Processes markdown content to update attachment links to their final filenames in the vault.
 * Handles [image: filename], [linkText](url), and [[filename]] patterns.
 * 
 * @param content The markdown content to process
 * @param getLocalFileNameByUrl Function to map URL to final vault filename
 * @param pathPrefix Optional path prefix to add to the links (e.g., 'attachments/folder/')
 * @returns The updated markdown content
 */
function processContentLinks(
	content: string,
	getLocalFileNameByUrl: (url: string) => string | null,
	pathPrefix: string = "",
): string {
    
	let updatedContent = content;

	// 1. Replace [image: url] or [image: name](url) -> need to robustly identify images
    // 2. Replace attachment links [linkText](url) with [[pathPrefix/finalName]]
	updatedContent = updatedContent.replace(
		/\[(.*?)\]\((.*?)\)/g,
		(match: string, linkText: string, url: string) => {
			const finalName = getLocalFileNameByUrl(url);
			console.log(`[TaskRobin] Resolving Normalized URL: ${normalizeUrl(url)} -> Local Filename: ${finalName}`);
			if (finalName) {
				return `[[${pathPrefix}${finalName}]]`;
			}
			return match;
		},
	);

	return updatedContent;
}
