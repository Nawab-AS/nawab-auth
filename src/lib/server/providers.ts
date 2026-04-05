import { createSupabaseAuthedClient } from '$lib/server/supabase';

export interface LinkedProvider {
	provider: string;
	identityId: string;
	createdAt: string | null;
}

export async function getLinkedProviders(accessToken: string): Promise<LinkedProvider[]> {
	const supabase = createSupabaseAuthedClient(accessToken);
	const { data, error } = await supabase.auth.getUserIdentities();

	if (error) {
		throw new Error(error.message);
	}

	return (data?.identities ?? [])
		.map((identity) => ({
			provider: identity.provider ?? '',
			identityId: identity.identity_id,
			createdAt: identity.created_at ?? null
		}))
		.filter((identity) => identity.provider.length > 0);
}

export async function revokeLinkedProvider(accessToken: string, provider: string) {
	const supabase = createSupabaseAuthedClient(accessToken);
	const { data, error } = await supabase.auth.getUserIdentities();
	if (error) {
		throw new Error(error.message);
	}

	const matchingIdentity = (data?.identities ?? []).find((identity) => identity.provider === provider);
	if (!matchingIdentity) {
		return false;
	}

	const { error: unlinkError } = await supabase.auth.unlinkIdentity(matchingIdentity);
	if (unlinkError) {
		throw new Error(unlinkError.message);
	}

	return true;
}
