using System;
using ConflictCore.Core.Numerics;
using ConflictCore.Protocol.Serialization;

namespace ConflictCore.Protocol.Tests;

public class PacketSerializationTests
{
    [Theory]
    [InlineData(0u, 1)]
    [InlineData(127u, 1)]
    [InlineData(128u, 2)]
    [InlineData(16_383u, 2)]
    [InlineData(uint.MaxValue, 5)]
    public void VarUInt_RoundTripsWithExpectedSize(uint value, int expectedBytes)
    {
        var writer = new PacketWriter(16);
        writer.WriteVarUInt(value);

        Assert.Equal(expectedBytes, writer.Length);
        var reader = new PacketReader(writer.Written);
        Assert.Equal(value, reader.ReadVarUInt());
        Assert.True(reader.IsAtEnd);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(63)]
    [InlineData(-64)]
    [InlineData(int.MaxValue)]
    [InlineData(int.MinValue)]
    public void VarInt_RoundTrips(int value)
    {
        var writer = new PacketWriter(16);
        writer.WriteVarInt(value);
        var reader = new PacketReader(writer.Written);

        Assert.Equal(value, reader.ReadVarInt());
    }

    [Fact]
    public void FixedWidthIntegers_RoundTrip()
    {
        var writer = new PacketWriter(32);
        writer.WriteUInt16(0xBEEF);
        writer.WriteUInt32(0xDEADBEEF);
        writer.WriteUInt64(0x0123456789ABCDEF);
        writer.WriteBool(true);
        var reader = new PacketReader(writer.Written);

        Assert.Equal(0xBEEF, reader.ReadUInt16());
        Assert.Equal(0xDEADBEEF, reader.ReadUInt32());
        Assert.Equal(0x0123456789ABCDEFUL, reader.ReadUInt64());
        Assert.True(reader.ReadBool());
        reader.ExpectEnd();
    }

    [Fact]
    public void Quantized_RoundsTowardNegativeInfinityAtRequestedPrecision()
    {
        var writer = new PacketWriter(16);
        writer.WriteQuantized(Fixed.Parse("123.4567"), 6);
        var reader = new PacketReader(writer.Written);
        Fixed decoded = reader.ReadQuantized(6);

        Assert.InRange((Fixed.Parse("123.4567") - decoded).ToDouble(), 0, 1.0 / 64);
    }

    [Fact]
    public void String_RoundTripsUtf8()
    {
        var writer = new PacketWriter(64);
        writer.WriteString("Командир 指挥官", 64);
        var reader = new PacketReader(writer.Written);

        Assert.Equal("Командир 指挥官", reader.ReadString(64));
    }

    [Fact]
    public void Reader_RejectsTruncatedInput()
    {
        var reader = new PacketReader(new ArraySegment<byte>(new byte[] { 1, 2, 3 }));

        Assert.Throws<ProtocolException>(() => reader.ReadUInt32());
    }

    [Fact]
    public void Reader_RejectsOverlongVarUInt()
    {
        var reader = new PacketReader(new ArraySegment<byte>(new byte[] { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01 }));

        Assert.Throws<ProtocolException>(() => reader.ReadVarUInt());
    }

    [Fact]
    public void Reader_RejectsStringLongerThanLimit()
    {
        var writer = new PacketWriter(64);
        writer.WriteString(new string('x', 40), 64);
        var reader = new PacketReader(writer.Written);

        Assert.Throws<ProtocolException>(() => reader.ReadString(32));
    }

    [Fact]
    public void Reader_RejectsInvalidBoolean()
    {
        var reader = new PacketReader(new ArraySegment<byte>(new byte[] { 2 }));

        Assert.Throws<ProtocolException>(() => reader.ReadBool());
    }

    [Fact]
    public void Reader_RespectsSegmentBounds()
    {
        byte[] buffer = { 9, 9, 7, 9 };
        var reader = new PacketReader(new ArraySegment<byte>(buffer, 2, 1));

        Assert.Equal(7, reader.ReadByte());
        Assert.Throws<ProtocolException>(() => reader.ReadByte());
    }

    [Fact]
    public void Writer_ThrowsOnOverflowInsteadOfCorrupting()
    {
        var writer = new PacketWriter(2);

        Assert.Throws<InvalidOperationException>(() => writer.WriteUInt32(1));
    }
}
