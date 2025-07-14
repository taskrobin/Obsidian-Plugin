import { OBSIDIAN_API } from "./constants";
import { SyncResponse } from "./types";

export async function createIntegration(sourceEmail: string, forwardingEmailAlias: string) {
	const response = await fetch(`${OBSIDIAN_API}/mappings`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			userEmail: sourceEmail,
			emailAlias: forwardingEmailAlias + "@taskrobin.io",
		}),
	});

	return await response.json();
}

export async function syncEmails(emailAddress: string, accessToken: string): Promise<SyncResponse> {
	const response = await fetch(`${OBSIDIAN_API}/emails/${emailAddress}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`API request failed: ${response.statusText}`);
	}

	return await response.json();
}

export async function deleteIntegration(emailAddress: string, forwardingEmailAlias: string, accessToken: string) {
	const response = await fetch(`${OBSIDIAN_API}/mappings`, {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			userEmail: emailAddress,
			emailAlias: forwardingEmailAlias + "@taskrobin.io",
			accessToken: accessToken,
		}),
	});

	if (!response.ok) {
		throw new Error(`API request failed: ${response.statusText}`);
	}

	return await response.json();
}