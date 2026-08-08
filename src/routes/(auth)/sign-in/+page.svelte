<script lang="ts">
	// STUB AWAITING DESIGN (T06). See +page.server.ts.
	import { Button, Card, CardContent, Input, Label, Separator } from '$lib/ui';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Mode = 'magic' | 'password' | 'register';

	/**
	 * Which of the three forms is showing: whatever the person last picked, otherwise
	 * whichever action last came back with something to say.
	 *
	 * THE FALLBACK IS NOT COSMETIC. These forms post natively — there is no `use:enhance`
	 * — so a `fail()` is a full page load and this component remounts. A plain
	 * `$state('magic')` therefore reset to the magic-link tab on every rejected password,
	 * rendering `form.password` unreachable: the person was bounced back with their email
	 * prefilled, no error, and no clue what had gone wrong. Deriving it also survives
	 * `use:enhance` being added later, where `form` changes without a remount.
	 */
	let chosen = $state<Mode | null>(null);
	const mode = $derived<Mode>(
		chosen ?? (form?.register ? 'register' : form?.password ? 'password' : 'magic')
	);

	const hasProvider = $derived(data.providers.google || data.providers.microsoft);
</script>

<svelte:head><title>Sign in · CJs</title></svelte:head>

<Card>
	<CardContent class="space-y-6 pt-6">
		{#if form?.sent}
			<!--
				Honest about what actually happened. In development no mail leaves the machine,
				so pointing the developer at their inbox would waste their afternoon.
			-->
			<div class="space-y-2 rounded-lg bg-settled-tint p-4 text-sm">
				<p class="font-medium text-settled-ink">
					{form.console ? 'Your link is in the server console' : 'Check your email'}
				</p>
				<p class="text-ink-secondary">
					{#if form.console}
						Email is not configured on this machine, so the sign-in link for
						<span class="font-mono">{form.email}</span> was printed to the terminal running the dev server.
					{:else}
						We sent a sign-in link to <span class="font-mono">{form.email}</span>. It works once and
						expires in 15 minutes.
					{/if}
				</p>
			</div>
		{/if}

		{#if mode === 'magic'}
			<form method="POST" action="?/magic" class="space-y-4">
				<div class="space-y-2">
					<Label for="magic-email">Email</Label>
					<Input
						id="magic-email"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
						aria-invalid={form?.magic ? 'true' : undefined}
						aria-describedby={form?.magic ? 'magic-error' : undefined}
					/>
					{#if form?.magic}
						<p id="magic-error" class="text-xs text-wrong">{form.magic}</p>
					{/if}
				</div>
				<Button type="submit" class="w-full">Email me a sign-in link</Button>
			</form>
		{:else if mode === 'password'}
			<form method="POST" action="?/password" class="space-y-4">
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
					/>
				</div>
				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						aria-invalid={form?.password ? 'true' : undefined}
						aria-describedby={form?.password ? 'password-error' : undefined}
					/>
					{#if form?.password}
						<p id="password-error" class="text-xs text-wrong">{form.password}</p>
					{/if}
				</div>
				<Button type="submit" class="w-full">Sign in</Button>
			</form>
		{:else}
			<form method="POST" action="?/register" class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Your name</Label>
					<Input id="name" name="name" autocomplete="name" required value={form?.name ?? ''} />
				</div>
				<div class="space-y-2">
					<Label for="new-email">Email</Label>
					<Input
						id="new-email"
						name="email"
						type="email"
						autocomplete="email"
						required
						value={form?.email ?? ''}
					/>
				</div>
				<div class="space-y-2">
					<Label for="new-password">Password</Label>
					<Input
						id="new-password"
						name="password"
						type="password"
						autocomplete="new-password"
						required
						aria-invalid={form?.register ? 'true' : undefined}
						aria-describedby={form?.register ? 'register-error' : undefined}
					/>
					<p class="text-xs text-ink-muted">At least 8 characters.</p>
					{#if form?.register}
						<p id="register-error" class="text-xs text-wrong">{form.register}</p>
					{/if}
				</div>
				<Button type="submit" class="w-full">Create your account</Button>
			</form>
		{/if}

		<div class="text-center text-xs text-ink-secondary">
			{#if mode === 'magic'}
				<button type="button" class="underline" onclick={() => (chosen = 'password')}>
					Use a password instead
				</button>
			{:else if mode === 'password'}
				<button type="button" class="underline" onclick={() => (chosen = 'magic')}>
					Email me a link instead
				</button>
				<span class="mx-1 text-ink-muted">·</span>
				<button type="button" class="underline" onclick={() => (chosen = 'register')}>
					Create an account
				</button>
			{:else}
				<button type="button" class="underline" onclick={() => (chosen = 'magic')}>
					I already have an account
				</button>
			{/if}
		</div>

		<!--
			Rendered only for providers `env.ts` reports as configured. A dead button reads as
			the product being broken; an absent one reads as the option not existing.
		-->
		{#if hasProvider}
			<div class="space-y-3">
				<Separator />
				{#if form?.social}
					<p class="text-xs text-wrong">{form.social}</p>
				{/if}
				<div class="grid gap-2">
					{#if data.providers.google}
						<form method="POST" action="?/social">
							<input type="hidden" name="provider" value="google" />
							<Button type="submit" variant="secondary" class="w-full">Continue with Google</Button>
						</form>
					{/if}
					{#if data.providers.microsoft}
						<form method="POST" action="?/social">
							<input type="hidden" name="provider" value="microsoft" />
							<Button type="submit" variant="secondary" class="w-full">
								Continue with Microsoft
							</Button>
						</form>
					{/if}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
