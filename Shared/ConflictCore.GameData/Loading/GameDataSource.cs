using System;
using System.Collections.Generic;
using System.IO;

namespace ConflictCore.GameData.Loading
{
    /// <summary>One data file: a stable, '/'-separated path relative to the data root, plus its text.</summary>
    public sealed class GameDataSource
    {
        public GameDataSource(string relativePath, string content)
        {
            RelativePath = relativePath.Replace('\\', '/');
            Content = content;
        }

        public string RelativePath { get; }

        public string Content { get; }

        /// <summary>
        /// Reads every *.json file under <paramref name="rootDirectory"/>. Used by the server and tools; the Unity
        /// client builds sources from packaged text assets instead.
        /// </summary>
        public static List<GameDataSource> FromDirectory(string rootDirectory)
        {
            string root = Path.GetFullPath(rootDirectory);
            var sources = new List<GameDataSource>();
            foreach (string file in Directory.GetFiles(root, "*.json", SearchOption.AllDirectories))
            {
                string relative = file.Substring(root.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                sources.Add(new GameDataSource(relative, File.ReadAllText(file)));
            }

            sources.Sort((a, b) => string.CompareOrdinal(a.RelativePath, b.RelativePath));
            return sources;
        }

        public override string ToString() => RelativePath;

        internal string NormalizedContent => Content.Replace("\r\n", "\n", StringComparison.Ordinal);
    }
}
