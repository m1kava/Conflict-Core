using ConflictCore.Protocol.Versioning;

namespace ConflictCore.Protocol.Tests;

public class VersioningTests
{
    [Theory]
    [InlineData("1.2.3", 1, 2, 3)]
    [InlineData("0.10.0-rc.1", 0, 10, 0)]
    [InlineData("2.0.1+build.77", 2, 0, 1)]
    public void SemanticVersion_ParsesCoreVersion(string text, int major, int minor, int patch)
    {
        Assert.True(SemanticVersion.TryParse(text, out SemanticVersion version));
        Assert.Equal(new SemanticVersion((ushort)major, (ushort)minor, (ushort)patch), version);
    }

    [Theory]
    [InlineData("")]
    [InlineData("1.2")]
    [InlineData("1.2.x")]
    [InlineData("-1.2.3")]
    [InlineData("1.2.3.4")]
    public void SemanticVersion_RejectsMalformedText(string text)
    {
        Assert.False(SemanticVersion.TryParse(text, out _));
    }

    [Fact]
    public void SemanticVersion_OrdersNumerically()
    {
        Assert.True(SemanticVersion.Parse("0.10.0") > SemanticVersion.Parse("0.9.9"));
        Assert.True(SemanticVersion.Parse("1.0.0") > SemanticVersion.Parse("0.99.99"));
    }

    [Fact]
    public void VersionPolicy_EvaluatesInPriorityOrder()
    {
        var policy = new VersionPolicy(ProtocolInfo.Version, SemanticVersion.Parse("0.2.0"), gameDataHash: 77);

        Assert.Equal(VersionCheckResult.Compatible, policy.Evaluate(ProtocolInfo.Version, SemanticVersion.Parse("0.2.0"), 77));
        Assert.Equal(VersionCheckResult.ProtocolMismatch, policy.Evaluate(ProtocolInfo.Version + 1, SemanticVersion.Parse("0.1.0"), 1));
        Assert.Equal(VersionCheckResult.ClientTooOld, policy.Evaluate(ProtocolInfo.Version, SemanticVersion.Parse("0.1.9"), 77));
        Assert.Equal(VersionCheckResult.DataMismatch, policy.Evaluate(ProtocolInfo.Version, SemanticVersion.Parse("0.3.0"), 78));
    }
}
