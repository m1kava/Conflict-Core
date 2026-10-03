using System.Collections.Generic;
using ConflictCore.Core.Numerics;

namespace ConflictCore.GameData.Definitions
{
    /// <summary>A damage category (e.g. small-arms, armor-piercing, high-explosive).</summary>
    public sealed class DamageTypeDefinition
    {
        public string Id { get; set; } = string.Empty;
    }

    /// <summary>An armor category (e.g. infantry, light vehicle, heavy armor, structure, aircraft).</summary>
    public sealed class ArmorTypeDefinition
    {
        public string Id { get; set; } = string.Empty;
    }

    /// <summary>One cell of the damage × armor effectiveness matrix. The validator requires every combination.</summary>
    public sealed class ArmorModifierDefinition
    {
        public string DamageType { get; set; } = string.Empty;

        public string ArmorType { get; set; } = string.Empty;

        public Fixed Multiplier { get; set; } = Fixed.One;
    }

    public sealed class WeaponPresentation
    {
        public string MuzzleVfx { get; set; } = string.Empty;

        public string ProjectileVfx { get; set; } = string.Empty;

        public string ImpactVfx { get; set; } = string.Empty;

        public string FireSound { get; set; } = string.Empty;
    }

    /// <summary>Data-driven weapon. Times in seconds and distances in metres; converted to ticks by the simulation.</summary>
    public sealed class WeaponDefinition
    {
        public string Id { get; set; } = string.Empty;

        public WeaponDelivery Delivery { get; set; }

        public Fixed Damage { get; set; }

        public string DamageType { get; set; } = string.Empty;

        public Fixed Range { get; set; }

        public Fixed MinRange { get; set; }

        /// <summary>Seconds between bursts.</summary>
        public Fixed ReloadTime { get; set; }

        public int BurstCount { get; set; } = 1;

        /// <summary>Seconds between shots inside a burst.</summary>
        public Fixed BurstInterval { get; set; }

        /// <summary>Hit probability 0..1 against a stationary target.</summary>
        public Fixed Accuracy { get; set; } = Fixed.One;

        public Fixed SplashRadius { get; set; }

        /// <summary>Damage fraction at the edge of the splash radius (linear falloff from 1 at the centre).</summary>
        public Fixed SplashEdgeFactor { get; set; } = Fixed.One;

        /// <summary>Metres per second; ignored for hitscan.</summary>
        public Fixed ProjectileSpeed { get; set; }

        /// <summary>Degrees per second; missiles only.</summary>
        public Fixed MissileTurnRate { get; set; }

        public bool FriendlyFire { get; set; }

        /// <summary>Suppression applied to infantry hit or near-missed by this weapon (0 = none).</summary>
        public Fixed Suppression { get; set; }

        public List<TargetLayer> Targets { get; set; } = new List<TargetLayer>();

        public WeaponPresentation Presentation { get; set; } = new WeaponPresentation();
    }
}
