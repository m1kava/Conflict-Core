using System;
using System.Globalization;

namespace ConflictCore.Protocol.Versioning
{
    /// <summary>MAJOR.MINOR.PATCH version used for client, server and backend builds.</summary>
    public readonly struct SemanticVersion : IEquatable<SemanticVersion>, IComparable<SemanticVersion>
    {
        public readonly ushort Major;
        public readonly ushort Minor;
        public readonly ushort Patch;

        public SemanticVersion(ushort major, ushort minor, ushort patch)
        {
            Major = major;
            Minor = minor;
            Patch = patch;
        }

        public static bool TryParse(string? text, out SemanticVersion version)
        {
            version = default;
            if (string.IsNullOrWhiteSpace(text))
            {
                return false;
            }

            // Pre-release / build metadata ("1.2.3-rc.1+abc") is informational and ignored for compatibility.
            string core = text!.Trim();
            int suffix = core.IndexOfAny(new[] { '-', '+' });
            if (suffix >= 0)
            {
                core = core.Substring(0, suffix);
            }

            string[] parts = core.Split('.');
            if (parts.Length != 3
                || !TryParsePart(parts[0], out ushort major)
                || !TryParsePart(parts[1], out ushort minor)
                || !TryParsePart(parts[2], out ushort patch))
            {
                return false;
            }

            version = new SemanticVersion(major, minor, patch);
            return true;
        }

        public static SemanticVersion Parse(string text)
        {
            if (!TryParse(text, out SemanticVersion version))
            {
                throw new FormatException($"'{text}' is not a MAJOR.MINOR.PATCH version.");
            }

            return version;
        }

        private static bool TryParsePart(string part, out ushort value) =>
            ushort.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out value);

        public static bool operator ==(SemanticVersion a, SemanticVersion b) => a.Equals(b);

        public static bool operator !=(SemanticVersion a, SemanticVersion b) => !a.Equals(b);

        public static bool operator <(SemanticVersion a, SemanticVersion b) => a.CompareTo(b) < 0;

        public static bool operator >(SemanticVersion a, SemanticVersion b) => a.CompareTo(b) > 0;

        public static bool operator <=(SemanticVersion a, SemanticVersion b) => a.CompareTo(b) <= 0;

        public static bool operator >=(SemanticVersion a, SemanticVersion b) => a.CompareTo(b) >= 0;

        public bool Equals(SemanticVersion other) => Major == other.Major && Minor == other.Minor && Patch == other.Patch;

        public override bool Equals(object? obj) => obj is SemanticVersion other && Equals(other);

        public override int GetHashCode() => HashCode.Combine(Major, Minor, Patch);

        public int CompareTo(SemanticVersion other)
        {
            int major = Major.CompareTo(other.Major);
            if (major != 0)
            {
                return major;
            }

            int minor = Minor.CompareTo(other.Minor);
            return minor != 0 ? minor : Patch.CompareTo(other.Patch);
        }

        public override string ToString() => $"{Major}.{Minor}.{Patch}";
    }
}
