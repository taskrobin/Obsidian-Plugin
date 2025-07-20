export function formatEmailFolderName(emailId: string, subject: string): string {
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