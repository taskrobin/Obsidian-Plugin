import { App, Notice } from "obsidian";
import { syncEmails } from "./api";
import { TaskRobinPluginSettings } from "./types";
import { formatEmailFolderName, sanitizeFileName } from "./utils";

export async function performEmailSync(
	app: App,
	settings: TaskRobinPluginSettings
): Promise<void> {
	try {
		new Notice(`Syncing your emails...`);
		const data = await syncEmails(
			settings.emailAddress,
			settings.accessToken
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
				const emailFolderPath = `${settings.rootDirectory}/${folderName}`;
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
