using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Commands;
using StargateAPI.Business.Data;

namespace StargateAPI.Tests;

public sealed class DutyTests : IDisposable {
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<StargateContext> _options;

    public DutyTests() {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        _options = new DbContextOptionsBuilder<StargateContext>()
            .UseSqlite(_connection)
            .Options;

        using var context = CreateContext();
        context.Database.EnsureCreated();
    }

    [Fact]
    public async Task CreateAstronautDutyHandler_CreatesDetailAndDuty() {
        await using var context = CreateContext();

        context.People.Add(new Person
        {
            Id = 1,
            Name = "john doe"
        });

        await context.SaveChangesAsync();

        var dutyDate = new DateTime(2026, 2, 1);

        var request = new CreateAstronautDuty
        {
            Name = "john doe",
            Rank = "1LT",
            DutyTitle = "Commander",
            DutyStartDate = dutyDate
        };

        var handler = new CreateAstronautDutyHandler(context);

        var result = await handler.Handle(request, CancellationToken.None);

        var detail = await context.AstronautDetails.SingleAsync();
        var duty = await context.AstronautDuties.SingleAsync();

        Assert.NotNull(result.Id);
        Assert.Equal(1, detail.PersonId);
        Assert.Equal("1LT", detail.CurrentRank);
        Assert.Equal("Commander", detail.CurrentDutyTitle);
        Assert.Equal(dutyDate.Date, detail.CareerStartDate);

        Assert.Equal(1, duty.PersonId);
        Assert.Equal("1LT", duty.Rank);
        Assert.Equal("Commander", duty.DutyTitle);
        Assert.Equal(dutyDate.Date, duty.DutyStartDate);
        Assert.Null(duty.DutyEndDate);
    }

    [Fact]
    public async Task CreateAstronautDutyPreProcessor_ThrowsWhenPersonDoesNotExist() {
        await using var context = CreateContext();

        var processor = new CreateAstronautDutyPreProcessor(context);

        var request = new CreateAstronautDuty
        {
            Name = "missing person",
            Rank = "1LT",
            DutyTitle = "Commander",
            DutyStartDate = new DateTime(2026, 2, 1)
        };

        await Assert.ThrowsAsync<BadHttpRequestException>(
            () => processor.Process(request, CancellationToken.None));

        var log = await context.LogEntries.SingleAsync();

        Assert.False(log.Success);
        Assert.Equal(
            "CreateAstronautDutyPreProcessor: Person not found.",
            log.Description);
    }

    private StargateContext CreateContext() {
        return new StargateContext(_options);
    }

    public void Dispose() {
        _connection.Dispose();
    }
}