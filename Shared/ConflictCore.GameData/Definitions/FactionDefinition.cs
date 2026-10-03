namespace ConflictCore.GameData.Definitions
{
    public sealed class FactionDefinition
    {
        public string Id { get; set; } = string.Empty;

        public string DisplayNameKey { get; set; } = string.Empty;

        /// <summary>Only playable factions are offered in lobbies; others are in development.</summary>
        public bool Playable { get; set; }
    }
}
