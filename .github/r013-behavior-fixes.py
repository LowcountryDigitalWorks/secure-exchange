from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected behavior-fix text not found in {path}")
    file.write_text(text.replace(old, new, 1))


# A delivery-store transaction failure must not mutate the challenge after the
# atomic exchange rolls back. AccessGrant drift is handled separately before it.
replace_once(
    "src/application/external-session-service.ts",
    """    try {
      await this.confirmGrantTargetUnchanged(target, at);
      await this.sessionStore.commit({
        kind: \"EXCHANGE_CHALLENGE\",
        exchange: {
          expectedChallengeVersion: challenge.version,
          expectedChallengeGeneration: challenge.generation,
          consumedChallenge: consumed,
          newSession: session,
          replacementAt: at,
        },
      });
    } catch {
      await this.invalidateChallengeForGrantFailure(challenge, at).catch(
        () => undefined,
      );
      throw this.externalAccessDenied();
    }""",
    """    try {
      await this.confirmGrantTargetUnchanged(target, at);
    } catch {
      await this.invalidateChallengeForGrantFailure(challenge, at).catch(
        () => undefined,
      );
      throw this.externalAccessDenied();
    }

    try {
      await this.sessionStore.commit({
        kind: \"EXCHANGE_CHALLENGE\",
        exchange: {
          expectedChallengeVersion: challenge.version,
          expectedChallengeGeneration: challenge.generation,
          consumedChallenge: consumed,
          newSession: session,
          replacementAt: at,
        },
      });
    } catch {
      throw this.externalAccessDenied();
    }""",
)

# Keep the synthetic fixture's generated IDs disjoint from seeded fixture IDs.
replace_once(
    "tests/helpers/external-session-fixture.ts",
    "return `${purpose}-${next}`;",
    "return `generated-${purpose}-${next}`;",
)

# Refresh session idle activity before testing AccessGrant expiry so the test
# isolates the intended authority boundary instead of failing on idle timeout.
expiry = Path("tests/integration/session-backed-access-grant-expiry.test.ts")
text = expiry.read_text()
needle = '''  fixture.clock.set("2026-08-14T12:14:59.999Z");
  const binding = await fixture.sessions.presentBrowserSession({'''
replacement = '''  fixture.clock.set("2026-08-14T12:09:00.000Z");
  await fixture.sessions.presentBrowserSession({
    deploymentId: DEPLOYMENT_A,
    threadId: THREAD_A,
    sessionId: session.sessionId,
    bearer: session.bearer,
  });

  fixture.clock.set("2026-08-14T12:14:59.999Z");
  const binding = await fixture.sessions.presentBrowserSession({'''
if needle not in text:
    raise SystemExit("Expected AccessGrant-expiry timing block not found")
expiry.write_text(text.replace(needle, replacement, 1))
