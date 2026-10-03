namespace ConflictCore.Core.Tests;

/// <summary>
/// Recorded outputs of deterministic code. A mismatch means simulation results changed for identical inputs,
/// which invalidates replays and cross-version re-simulation. See docs/adr/0003-fixed-point-simulation.md.
/// </summary>
internal static class GoldenChecksums
{
    public const ulong MathFunctions = 16792235178948472839UL;

    public static readonly uint[] RandomSeed42 = { 1898997482u, 1014631766u, 4096008554u };
}
