import { OBSIDIAN_API, TASKROBIN_API } from "./constants";
import { SyncResponse } from "./types";

export async function createIntegration(
	sourceEmail: string,
	forwardingEmailAlias: string,
	auth: { verificationToken?: string; accessToken?: string }
) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	// If the email is already verified (an existing integration's
	// accessToken is available for this email), use it as proof of
	// ownership instead of requiring a fresh OTP verification.
	if (auth.accessToken) {
		headers["Authorization"] = `Bearer ${auth.accessToken}`;
	}

	const response = await fetch(`${OBSIDIAN_API}/mappings`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			userEmail: sourceEmail,
			emailAlias: forwardingEmailAlias + "@taskrobin.io",
			...(auth.verificationToken
				? { verificationToken: auth.verificationToken }
				: {}),
		}),
	});

	return await response.json();
}

/**
 * Requests that a one-time authentication code be sent to the given email
 * address. The backend is responsible for generating and emailing the code.
 */
export async function requestAuthCode(email: string) {
	const response = await fetch(`${TASKROBIN_API}/auth/emails/request-code`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email }),
	});

	return await response.json();
}

/**
 * Verifies a one-time authentication code previously sent to the given
 * email address. On success, the backend returns a short-lived
 * verificationToken that must be supplied when creating the integration.
 */
export async function verifyAuthCode(email: string, code: string) {
	const response = await fetch(`${TASKROBIN_API}/auth/emails/verify-code`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email, code }),
	});

	return await response.json();
}

export async function syncEmails(
	emailAddress: string,
	accessToken: string,
	forwardingEmailAlias?: string
): Promise<SyncResponse> {
	const url = forwardingEmailAlias
		? `${OBSIDIAN_API}/emails/${emailAddress}?forwardingAddress=${forwardingEmailAlias}@taskrobin.io`
		: `${OBSIDIAN_API}/emails/${emailAddress}`;

	const response = await fetch(url, {
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

export async function deleteIntegration(
	emailAddress: string,
	forwardingEmailAlias: string,
	accessToken: string
) {
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
