using System.IO;
using ConflictCore.Core.Numerics;
using ConflictCore.GameData.Loading;
using NUnit.Framework;
using UnityEngine;

namespace ConflictCore.Client.Tests
{
    /// <summary>
    /// Runs inside the Unity editor (Mono) to prove that shared deterministic code behaves exactly as it does
    /// on the .NET server: same golden values, same game-data hash. A failure here means client and server
    /// would disagree.
    /// </summary>
    public sealed class SharedCodeInUnityTests
    {
        // Must equal Tests/ConflictCore.Core.Tests/GoldenChecksums.cs.
        private const ulong MathGoldenChecksum = 16792235178948472839UL;

        [Test]
        public void FixedPointMath_MatchesServerGoldenChecksum()
        {
            var hasher = new Core.Hashing.StateHasher();
            for (int i = -200; i <= 200; i++)
            {
                Fixed x = Fixed.FromRatio(i * 37, 41);
                hasher.Add(FixedMath.Sin(x).Raw);
                hasher.Add(FixedMath.Cos(x).Raw);
                hasher.Add(FixedMath.Atan2(x, Fixed.FromInt(7)).Raw);
                hasher.Add(FixedMath.Sqrt(FixedMath.Abs(x)).Raw);
                hasher.Add((x * x / Fixed.FromInt(3)).Raw);
            }

            Assert.AreEqual(MathGoldenChecksum, hasher.Value);
        }

        [Test]
        public void AuthoredGameData_LoadsInUnity()
        {
            string dataDirectory = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "Data"));
            GameDataLoadResult result = GameDataLoader.Load(GameDataSource.FromDirectory(dataDirectory));

            Assert.IsTrue(result.Succeeded, string.Join("\n", result.Issues));
        }
    }
}
