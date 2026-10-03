using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using ConflictCore.Server.Simulation;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ConflictCore.Server.Hosting;

/// <summary>
/// Runs the fixed-tick loop of a single match on a dedicated background task.
/// </summary>
/// <remarks>
/// Status: PARTIAL. Timing, catch-up and shutdown are implemented; network I/O, command intake and snapshot
/// output are added in Phase 4 around <see cref="IMatchSimulation.Step"/>.
/// </remarks>
public sealed partial class MatchHostService : BackgroundService
{
    private static readonly TimeSpan StatsInterval = TimeSpan.FromSeconds(30);

    private readonly IMatchSimulation _simulation;
    private readonly MatchServerOptions _options;
    private readonly ILogger<MatchHostService> _logger;

    public MatchHostService(IMatchSimulation simulation, IOptions<MatchServerOptions> options, ILogger<MatchHostService> logger)
    {
        _simulation = simulation;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var clock = new FixedTickClock(_options.TickRate, _options.MaxCatchUpTicks);
        var wallClock = Stopwatch.StartNew();
        TimeSpan previous = wallClock.Elapsed;
        TimeSpan nextStats = previous + StatsInterval;
        TimeSpan worstStep = TimeSpan.Zero;

        LogStarted(_options.TickRate, _options.Port);

        while (!stoppingToken.IsCancellationRequested)
        {
            TimeSpan now = wallClock.Elapsed;
            int due = clock.Advance(now - previous);
            previous = now;

            for (int i = 0; i < due; i++)
            {
                long stepStart = Stopwatch.GetTimestamp();
                _simulation.Step();
                TimeSpan stepTime = Stopwatch.GetElapsedTime(stepStart);
                if (stepTime > worstStep)
                {
                    worstStep = stepTime;
                }
            }

            if (now >= nextStats)
            {
                LogStats(_simulation.CurrentTick.Value, worstStep.TotalMilliseconds, clock.DroppedTime.TotalMilliseconds);
                worstStep = TimeSpan.Zero;
                nextStats = now + StatsInterval;
            }

            await Task.Delay(clock.TimeUntilNextTick, stoppingToken).ConfigureAwait(false);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Match loop started at {TickRate} Hz (port {Port}).")]
    private partial void LogStarted(int tickRate, int port);

    [LoggerMessage(Level = LogLevel.Information, Message = "Tick {Tick}: worst step {WorstStepMs:F2} ms, dropped {DroppedMs:F0} ms total.")]
    private partial void LogStats(uint tick, double worstStepMs, double droppedMs);
}
