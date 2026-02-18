export function formatEmailFolderName(
	emailId: string,
	subject: string,
): string {
	// Convert string emailId to number and remove the last 6 digits to get the standard Unix timestamp
	const timestamp = Math.floor(parseInt(emailId) / 1000000);

	// Create a Date object from the Unix timestamp
	const date = new Date(timestamp * 1000);

	// Format the date as YYYY-MM-DD
	const formattedDate = date.toISOString().split("T")[0];

	// Use default if subject is empty or only whitespace
	const rawName = `${formattedDate} ${subject?.trim() || "No Subject"}`;

	// Remove invalid file system characters: * " \ / < > : | ?
	// Also remove trailing dots or spaces which are problematic in Windows
	const safeName = rawName
		.replace(/[\*"\\\/\<\>\:\|\?]/g, "_") // Replace invalid chars with underscore
		.replace(/[. ]+$/, ""); // Remove trailing dots or spaces

	return safeName;
}

export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function isTaskRobinEmail(email: string): boolean {
	return email.toLowerCase().endsWith("@taskrobin.io");
}

export function sanitizeFileName(fileName: string): string {
	return fileName.replace(/[*"\/<>:|?]/g, "_");
}

export interface DirectoryValidationResult {
	isValid: boolean;
	errorMessage?: string;
}

export function validateDirectoryPath(path: string): DirectoryValidationResult {
	if (!path || path.trim() === "") {
		return {
			isValid: false,
			errorMessage: "Directory path cannot be empty",
		};
	}

	// Check for consecutive slashes
	if (path.includes("//")) {
		return {
			isValid: false,
			errorMessage: "Path cannot contain consecutive slashes (//)",
		};
	}

	// Check for illegal characters: < > : " | ? * and control characters
	const illegalChars = /[<>:"|?*\x00-\x1f]/;
	if (illegalChars.test(path)) {
		const foundChars = path.match(illegalChars);
		return {
			isValid: false,
			errorMessage: `Directory path contains illegal characters: ${foundChars?.join(", ")}`,
		};
	}

	// Check for backslashes (should use forward slashes in Obsidian paths)
	if (path.includes("\\")) {
		return {
			isValid: false,
			errorMessage:
				"Use forward slashes (/) instead of backslashes (\\) in directory paths",
		};
	}

	// Check for reserved Windows names (case-insensitive)
	const reservedNames = [
		"CON",
		"PRN",
		"AUX",
		"NUL",
		"COM1",
		"COM2",
		"COM3",
		"COM4",
		"COM5",
		"COM6",
		"COM7",
		"COM8",
		"COM9",
		"LPT1",
		"LPT2",
		"LPT3",
		"LPT4",
		"LPT5",
		"LPT6",
		"LPT7",
		"LPT8",
		"LPT9",
	];
	const pathParts = path.split("/");
	for (const part of pathParts) {
		const upperPart = part.toUpperCase();
		if (reservedNames.includes(upperPart)) {
			return {
				isValid: false,
				errorMessage: `Directory path contains reserved name: ${part}`,
			};
		}
	}

	// Check for trailing dots or spaces (problematic in Windows)
	if (/[. ]+$/.test(path)) {
		return {
			isValid: false,
			errorMessage: "Directory path cannot end with dots or spaces",
		};
	}

	return {
		isValid: true,
	};
}
