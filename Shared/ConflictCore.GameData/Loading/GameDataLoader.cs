using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using ConflictCore.GameData.Validation;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

namespace ConflictCore.GameData.Loading
{
    /// <summary>Outcome of loading game data: a database when valid, otherwise every problem found.</summary>
    public sealed class GameDataLoadResult
    {
        public GameDataLoadResult(GameDatabase? database, IReadOnlyList<ValidationIssue> issues)
        {
            Database = database;
            Issues = issues;
        }

        public GameDatabase? Database { get; }

        public IReadOnlyList<ValidationIssue> Issues { get; }

        public bool Succeeded => Database != null;
    }

    /// <summary>
    /// Parses, merges and validates game data files and computes the content hash that client and server
    /// compare during the handshake. Loading is strict: unknown fields, wrong types and broken references
    /// are errors, so typos in balance data fail CI instead of silently defaulting.
    /// </summary>
    public static class GameDataLoader
    {
        private static readonly JsonSerializerSettings SerializerSettings = CreateSettings();

        public static GameDataLoadResult Load(IReadOnlyList<GameDataSource> sources)
        {
            var issues = new List<ValidationIssue>();
            var merged = new GameDataDocument();

            var ordered = new List<GameDataSource>(sources);
            ordered.Sort((a, b) => string.CompareOrdinal(a.RelativePath, b.RelativePath));

            foreach (GameDataSource source in ordered)
            {
                GameDataDocument? document = Parse(source, issues);
                if (document != null)
                {
                    merged.MergeFrom(document);
                }
            }

            if (issues.Count == 0)
            {
                issues.AddRange(GameDataValidator.Validate(merged));
            }

            if (issues.Count > 0)
            {
                return new GameDataLoadResult(null, issues);
            }

            return new GameDataLoadResult(new GameDatabase(merged, ComputeContentHash(ordered)), issues);
        }

        /// <summary>
        /// First 8 bytes of SHA-256 over every file's path and line-ending-normalised content, in ordinal path
        /// order. Any balance change produces a different hash, so mismatched client/server data is detected.
        /// </summary>
        public static ulong ComputeContentHash(IReadOnlyList<GameDataSource> orderedSources)
        {
            using (var sha = SHA256.Create())
            {
                foreach (GameDataSource source in orderedSources)
                {
                    byte[] path = Encoding.UTF8.GetBytes(source.RelativePath + "\n");
                    byte[] content = Encoding.UTF8.GetBytes(source.NormalizedContent + "\n");
                    sha.TransformBlock(path, 0, path.Length, null, 0);
                    sha.TransformBlock(content, 0, content.Length, null, 0);
                }

                sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
                byte[] digest = sha.Hash!;
                return BitConverter.ToUInt64(digest, 0);
            }
        }

        private static GameDataDocument? Parse(GameDataSource source, List<ValidationIssue> issues)
        {
            try
            {
                GameDataDocument? document = JsonConvert.DeserializeObject<GameDataDocument>(source.Content, SerializerSettings);
                if (document == null)
                {
                    issues.Add(new ValidationIssue(source.RelativePath, "File is empty or null."));
                }

                return document;
            }
            catch (JsonException exception)
            {
                issues.Add(new ValidationIssue(source.RelativePath, exception.Message));
                return null;
            }
        }

        private static JsonSerializerSettings CreateSettings()
        {
            var settings = new JsonSerializerSettings
            {
                MissingMemberHandling = MissingMemberHandling.Error,
                FloatParseHandling = FloatParseHandling.Decimal,
                ContractResolver = new CamelCasePropertyNamesContractResolver(),
                DateParseHandling = DateParseHandling.None,
            };
            settings.Converters.Add(new FixedJsonConverter());
            settings.Converters.Add(new StringEnumConverter { AllowIntegerValues = false });
            return settings;
        }
    }
}
