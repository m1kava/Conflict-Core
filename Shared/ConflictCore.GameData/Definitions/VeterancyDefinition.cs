using ConflictCore.Core.Numerics;

namespace ConflictCore.GameData.Definitions
{
    /// <summary>
    /// One veterancy rank (e.g. Recruit, Veteran, Elite, Heroic). Ranks are ordered by
    /// <see cref="ExperienceRequired"/>, expressed as a multiple of the unit's own cost so that cheap and
    /// expensive units promote after comparable relative achievement.
    /// </summary>
    public sealed class VeterancyLevelDefinition
    {
        public string Id { get; set; } = string.Empty;

        public string DisplayNameKey { get; set; } = string.Empty;

        public Fixed ExperienceRequired { get; set; }

        public Fixed DamageMultiplier { get; set; } = Fixed.One;

        public Fixed ReloadMultiplier { get; set; } = Fixed.One;

        public Fixed AccuracyMultiplier { get; set; } = Fixed.One;

        public Fixed HealthMultiplier { get; set; } = Fixed.One;

        public Fixed SpeedMultiplier { get; set; } = Fixed.One;

        /// <summary>Health regenerated per second as a fraction of max health (0 = none).</summary>
        public Fixed RegenerationPerSecond { get; set; }
    }
}
