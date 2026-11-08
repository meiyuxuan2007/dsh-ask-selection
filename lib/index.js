/**
 * dsh-ask-selection — Host half.
 *
 * The whole feature lives in the client half (lib/client.js): the Host needs
 * no service, tool or config of its own. This file only satisfies the bundle
 * contract so the Loader can start the package.
 */
export function apply() {
	// Intentionally empty: no Host-side registration.
}
