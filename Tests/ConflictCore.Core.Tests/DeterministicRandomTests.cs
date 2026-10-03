using System;
using ConflictCore.Core.Numerics;

namespace ConflictCore.Core.Tests;

public class DeterministicRandomTests
{
    [Fact]
    public void SameSeed_ProducesSameSequence()
    {
        var a = new DeterministicRandom(12345);
        var b = new DeterministicRandom(12345);

        for (int i = 0; i < 1000; i++)
        {
            Assert.Equal(a.NextUInt(), b.NextUInt());
        }
    }

    [Fact]
    public void DifferentSeeds_Diverge()
    {
        var a = new DeterministicRandom(1);
        var b = new DeterministicRandom(2);

        Assert.NotEqual(a.NextUInt(), b.NextUInt());
    }

    [Fact]
    public void RestoredGenerator_ContinuesIdentically()
    {
        var original = new DeterministicRandom(99);
        original.NextUInt();
        DeterministicRandom restored = DeterministicRandom.Restore(original.State, original.Increment);

        for (int i = 0; i < 100; i++)
        {
            Assert.Equal(original.NextUInt(), restored.NextUInt());
        }
    }

    [Fact]
    public void Restore_RejectsEvenIncrement()
    {
        Assert.Throws<ArgumentException>(() => DeterministicRandom.Restore(1, 2));
    }

    [Fact]
    public void NextInt_StaysInRangeAndCoversIt()
    {
        var random = new DeterministicRandom(7);
        var seen = new bool[10];
        for (int i = 0; i < 10_000; i++)
        {
            int value = random.NextInt(10);
            Assert.InRange(value, 0, 9);
            seen[value] = true;
        }

        Assert.All(seen, Assert.True);
    }

    [Fact]
    public void NextFixed01_StaysInUnitInterval()
    {
        var random = new DeterministicRandom(3);
        for (int i = 0; i < 10_000; i++)
        {
            Fixed value = random.NextFixed01();
            Assert.True(value >= Fixed.Zero && value < Fixed.One);
        }
    }

    /// <summary>Golden values: changing the generator breaks replays and must come with a version bump.</summary>
    [Fact]
    public void Sequence_MatchesGoldenValues()
    {
        var random = new DeterministicRandom(42);
        uint[] actual = { random.NextUInt(), random.NextUInt(), random.NextUInt() };

        Assert.Equal(GoldenChecksums.RandomSeed42, actual);
    }
}
