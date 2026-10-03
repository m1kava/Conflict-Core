using System;
using ConflictCore.Core.Identifiers;
using ConflictCore.Core.Numerics;
using ConflictCore.Protocol.Commands;
using ConflictCore.Protocol.Serialization;

namespace ConflictCore.Protocol.Tests;

public class CommandCodecTests
{
    [Fact]
    public void MoveCommand_RoundTripsAndStaysCompact()
    {
        var batch = new CommandBatch { FirstSequence = 17, ClientObservedTick = 900 };
        PlayerCommand move = batch.Add();
        move.Type = CommandType.Move;
        move.Queued = true;
        move.Formation = FormationKind.Wedge;
        move.TargetKind = CommandTargetKind.Position;
        move.TargetPosition = new FixedVector2(Fixed.Parse("512.25"), Fixed.Parse("130.5"));
        for (uint id = 100; id < 112; id++)
        {
            move.Subjects.Add(new EntityId(id * 3));
        }

        var writer = new PacketWriter(1024);
        batch.Write(writer);
        Assert.True(writer.Length < 40, $"Move command for 12 units took {writer.Length} bytes.");

        var decoded = new CommandBatch();
        var reader = new PacketReader(writer.Written);
        decoded.Read(ref reader);

        Assert.Equal(17u, decoded.FirstSequence);
        Assert.Equal(900u, decoded.ClientObservedTick);
        PlayerCommand result = Assert.Single(decoded.Commands);
        Assert.Equal(CommandType.Move, result.Type);
        Assert.True(result.Queued);
        Assert.Equal(FormationKind.Wedge, result.Formation);
        Assert.Equal(move.TargetPosition, result.TargetPosition);
        Assert.Equal(move.Subjects, result.Subjects);
    }

    [Fact]
    public void AttackCommand_RoundTripsEntityTarget()
    {
        PlayerCommand decoded = RoundTrip(command =>
        {
            command.Type = CommandType.Attack;
            command.TargetKind = CommandTargetKind.Entity;
            command.TargetEntity = new EntityId(4242);
            command.Subjects.Add(new EntityId(7));
        });

        Assert.Equal(CommandType.Attack, decoded.Type);
        Assert.Equal(new EntityId(4242), decoded.TargetEntity);
    }

    [Fact]
    public void PlaceBuilding_RoundTripsArgumentAndRotation()
    {
        PlayerCommand decoded = RoundTrip(command =>
        {
            command.Type = CommandType.PlaceBuilding;
            command.TargetKind = CommandTargetKind.Position;
            command.TargetPosition = new FixedVector2(Fixed.FromInt(64), Fixed.FromInt(96));
            command.Argument = 5;
            command.Rotation = 3;
            command.Subjects.Add(new EntityId(12));
        });

        Assert.Equal(5u, decoded.Argument);
        Assert.Equal(3, decoded.Rotation);
    }

    [Fact]
    public void DuplicateSubjects_AreRejected()
    {
        // A hostile client hand-crafts a zero delta, i.e. the same unit twice, to try to double-apply an order.
        var writer = new PacketWriter(64);
        writer.WriteByte((byte)CommandType.Stop);
        writer.WriteByte(0);
        writer.WriteVarUInt(2);
        writer.WriteVarUInt(5);
        writer.WriteVarUInt(0);

        Assert.Throws<ProtocolException>(() => DecodeCommand(writer));
    }

    [Fact]
    public void OversizedSubjectList_IsRejectedBeforeAllocation()
    {
        var writer = new PacketWriter(64);
        writer.WriteByte((byte)CommandType.Stop);
        writer.WriteByte(0);
        writer.WriteVarUInt(1_000_000);

        Assert.Throws<ProtocolException>(() => DecodeCommand(writer));
    }

    [Fact]
    public void UnknownCommandType_IsRejected()
    {
        var writer = new PacketWriter(64);
        writer.WriteByte(250);

        Assert.Throws<ProtocolException>(() => DecodeCommand(writer));
    }

    [Fact]
    public void UnknownFlags_AreRejected()
    {
        var writer = new PacketWriter(64);
        writer.WriteByte((byte)CommandType.Stop);
        writer.WriteByte(0x80);

        Assert.Throws<ProtocolException>(() => DecodeCommand(writer));
    }

    [Fact]
    public void BatchWithZeroSequence_IsRejected()
    {
        var batch = new CommandBatch { FirstSequence = 0 };
        batch.Add().Type = CommandType.Stop;
        var writer = new PacketWriter(64);
        batch.Write(writer);

        Assert.Throws<ProtocolException>(() => Decode(writer.Written.ToArray()));
    }

    [Fact]
    public void Batch_RefusesMoreThanLimit()
    {
        var batch = new CommandBatch();
        for (int i = 0; i < CommandBatch.MaxCommandsPerBatch; i++)
        {
            batch.Add();
        }

        Assert.Throws<InvalidOperationException>(() => batch.Add());
    }

    /// <summary>Hostile input must only ever produce <see cref="ProtocolException"/>, never crash the server.</summary>
    [Fact]
    public void RandomGarbage_NeverThrowsAnythingButProtocolException()
    {
        var random = new DeterministicRandom(2024);
        var batch = new CommandBatch();
        for (int iteration = 0; iteration < 20_000; iteration++)
        {
            byte[] garbage = new byte[random.NextInt(1, 64)];
            for (int i = 0; i < garbage.Length; i++)
            {
                garbage[i] = (byte)random.NextInt(256);
            }

            garbage[0] = (byte)Messages.MessageType.CommandBatch;
            try
            {
                var reader = new PacketReader(new ArraySegment<byte>(garbage));
                batch.Read(ref reader);
            }
            catch (ProtocolException)
            {
                // expected for malformed input
            }
        }
    }

    private static PlayerCommand RoundTrip(Action<PlayerCommand> configure) =>
        Assert.Single(Decode(EncodeSingle(configure)).Commands);

    private static byte[] EncodeSingle(Action<PlayerCommand> configure)
    {
        var writer = new PacketWriter(1024);
        writer.WriteByte((byte)Messages.MessageType.CommandBatch);
        writer.WriteVarUInt(1);
        writer.WriteVarUInt(0);
        writer.WriteVarUInt(1);
        var command = new PlayerCommand();
        configure(command);
        CommandCodec.Write(writer, command);
        return writer.Written.ToArray();
    }

    private static CommandBatch Decode(byte[] payload)
    {
        var batch = new CommandBatch();
        var reader = new PacketReader(new ArraySegment<byte>(payload));
        batch.Read(ref reader);
        return batch;
    }

    private static void DecodeCommand(PacketWriter writer)
    {
        var reader = new PacketReader(writer.Written);
        CommandCodec.Read(ref reader, new PlayerCommand());
    }
}
