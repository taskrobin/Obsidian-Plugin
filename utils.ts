import "moment-timezone";
import { moment } from "obsidian";
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
 * Replaces the trailing unix timestamp in filenames with a formatted, sortable
 * date-time string. Two cases are handled:
 *
 * 1. Main email files named like "email-<emailId>_<timestamp>.md" (e.g.
 *    "email-1754642310048602_1754642310.0560887.md"). Both the "email-" prefix
 *    and the long emailId digit run are dropped (redundant with the timestamp),
 *    producing just "2026-07-13 101512.md".
 * 2. Any other file with a trailing "_<timestamp>" right before the extension
 *    (e.g. "image_1781517559.8963816.png"), which becomes
 *    "image 2026-07-13 101512.png".

 *
 * @param fileName The original filename
 * @param settings The plugin settings
 * @returns The filename with the timestamp replaced by a formatted date-time
 */
export function replaceFilenameTimestamp(
	fileName: string,
	settings: TaskRobinPluginSettings,
): string {
	// Date + time format used for filenames (independent of settings.datetimeFormat,
	// which is only used for the folder name) so that multiple messages within the
	// same thread/day still produce distinct, sortable filenames.
	const filenameDateTimeFormat = "YYYY-MM-DD HHmmss";

	const formatMicroTimestamp = (timestampStr: string): string => {
		// Convert the seconds-based timestamp from the filename to microseconds
		// for consistency with formatTimestamp, which expects microseconds.
		const microTimestamp = (parseFloat(timestampStr) * 1000000).toString();
		const formattedDateTime = formatTimestamp(microTimestamp, {
			...settings,
			datetimeFormat: filenameDateTimeFormat,
		});
		return formattedDateTime.replace(/[:\/\\*?"<>|]/g, "-");
	};

	// Case 1: main email file "email-<emailId>_<timestamp><ext>" - drop both the
	// "email-" prefix and the emailId.
	const mainEmailRegex = /^email-\d{10,}_(\d{10}(?:\.\d+)?)(\.[^.\/]+)$/;
	const mainEmailMatch = fileName.match(mainEmailRegex);
	if (mainEmailMatch) {
		const sanitizedDateTime = formatMicroTimestamp(mainEmailMatch[1]);
		return `${sanitizedDateTime}${mainEmailMatch[2]}`;
	}

	// Case 2: any other file with a trailing "_<timestamp>" before the extension.
	const timestampRegex = /_(\d{10}(?:\.\d+)?)(\.[^.\/]+)$/;
	const match = fileName.match(timestampRegex);
	if (match) {
		const sanitizedDateTime = formatMicroTimestamp(match[1]);
		return fileName.replace(match[0], ` ${sanitizedDateTime}${match[2]}`);
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
