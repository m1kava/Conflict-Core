using System.Collections.Generic;
using ConflictCore.Core.Numerics;

namespace ConflictCore.GameData.Definitions
{
    public sealed class MovementDefinition
    {
        public Locomotor Locomotor { get; set; }

        /// <summary>Metres per second.</summary>
        public Fixed Speed { get; set; }

        /// <summary>Metres per second squared.</summary>
        public Fixed Acceleration { get; set; }

        /// <summary>Hull turn rate, degrees per second.</summary>
        public Fixed TurnRate { get; set; }

        /// <summary>Collision / formation spacing radius in metres.</summary>
        public Fixed Radius { get; set; }
    }

    /// <summary>A weapon mounted on a unit, optionally on an independently rotating turret.</summary>
    public sealed class WeaponMountDefinition
    {
        public string Weapon { get; set; } = string.Empty;

        public bool Turreted { get; set; }

        /// <summary>Turret traverse, degrees per second (turreted mounts only).</summary>
        public Fixed TurretTurnRate { get; set; }
    }

    /// <summary>Client presentation references. Never read by the server simulation.</summary>
    public sealed class UnitPresentation
    {
        public string Model { get; set; } = string.Empty;

        /// <summary>Addressable keys for LOD0..LOD3 (or impostor) representations.</summary>
        public List<string> Lods { get; set; } = new List<string>();

        public string AnimationProfile { get; set; } = string.Empty;

        public string Portrait { get; set; } = string.Empty;

        public string SelectSound { get; set; } = string.Empty;

        public string MoveSound { get; set; } = string.Empty;

        public string AttackSound { get; set; } = string.Empty;

        public string DeathVfx { get; set; } = string.Empty;
    }

    /// <summary>Replication hints for the snapshot system.</summary>
    public sealed class UnitNetworkDefinition
    {
        /// <summary>Higher priority entities are sent first when a snapshot hits its byte budget.</summary>
        public int Priority { get; set; } = 1;
    }

    /// <summary>
    /// Complete, data-driven description of a unit type. No unit is hard-coded: the simulation, client and
    /// tools all read these definitions. Balance changes are data edits validated in CI.
    /// </summary>
    public sealed class UnitDefinition
    {
        public string Id { get; set; } = string.Empty;

        public string Faction { get; set; } = string.Empty;

        public UnitClass Class { get; set; }

        /// <summary>Localisation key; display strings never live in balance data.</summary>
        public string DisplayNameKey { get; set; } = string.Empty;

        public Fixed Health { get; set; }

        public string ArmorType { get; set; } = string.Empty;

        public MovementDefinition Movement { get; set; } = new MovementDefinition();

        public List<WeaponMountDefinition> Weapons { get; set; } = new List<WeaponMountDefinition>();

        public Fixed VisionRadius { get; set; }

        /// <summary>Radius within which stealthed enemies are revealed (0 = no detection).</summary>
        public Fixed DetectionRadius { get; set; }

        public int Cost { get; set; }

        /// <summary>Seconds to produce at normal power.</summary>
        public Fixed BuildTime { get; set; }

        /// <summary>Structure or upgrade ids that must exist before this unit can be produced.</summary>
        public List<string> Prerequisites { get; set; } = new List<string>();

        /// <summary>Experience granted to the killer, as a fraction of <see cref="Cost"/> (see veterancy rules).</summary>
        public Fixed ExperienceValue { get; set; } = Fixed.One;

        public List<string> Abilities { get; set; } = new List<string>();

        public UnitPresentation Presentation { get; set; } = new UnitPresentation();

        public UnitNetworkDefinition Network { get; set; } = new UnitNetworkDefinition();
    }
}
