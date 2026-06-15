import { moment } from "obsidian";
import "moment-timezone";
import { TaskRobinPluginSettings } from "./types";

export function formatTimestamp(
	timestampStr: string,
	settings: TaskRobinPluginSettings,
): string {
	// API provides timestamps in microseconds. 
	// moment.unix() expects seconds.
	const timestampInSeconds = parseFloat(timestampStr) / 1000000;
	let date = moment.unix(timestampInSeconds);

	if (settings.timezone) {
		date = (date as any).tz(settings.timezone);
	}

	const format = settings.datetimeFormat || "YYYY-MM-DD";
	return date.format(format);
}

export function formatEmailFolderName(
	emailId: string,
	subject: string,
	settings: TaskRobinPluginSettings,
): string {
	const formattedDate = formatTimestamp(emailId, settings);

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

/**
 * Replaces unix timestamps in filenames (e.g., _1234567890.123) with a formatted date string.
 * @param fileName The original filename
 * @param settings The plugin settings
 * @returns The filename with the timestamp replaced by a formatted date
 */
export function replaceFilenameTimestamp(
	fileName: string,
	settings: TaskRobinPluginSettings,
): string {
	// Match unix timestamp like 1781490899 or 1781490899.936054
	const timestampRegex = /(\d{10}(?:\.\d+)?)/;
	const match = fileName.match(timestampRegex);

	if (match) {
		const timestampStr = match[1];
		
		// Convert the seconds-based timestamp from the filename to microseconds 
		// for consistency with formatTimestamp, which expects microseconds.
		const microTimestamp = (parseFloat(timestampStr) * 1000000).toString();
		const formattedDate = formatTimestamp(microTimestamp, settings);

		// Replace the timestamp with the formatted date, sanitized for file systems
		const sanitizedDate = formattedDate.replace(/[:\/\\*?"<>|]/g, "-");
		return fileName.replace(timestampStr, sanitizedDate);
	}

	return fileName;
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
