using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Commands;
using StargateAPI.Business.Data;

namespace StargateAPI.Tests {
    public sealed class RulesTests : IDisposable {
        private readonly SqliteConnection _connection;
        private readonly DbContextOptions<StargateContext> _options;

        public RulesTests() {
            _connection = new SqliteConnection("Data Source=:memory:");
            _connection.Open();

            _options = new DbContextOptionsBuilder<StargateContext>()
                .UseSqlite(_connection)
                .Options;

            using var context = CreateContext();
            context.Database.EnsureCreated();
        }

        [Fact]
        public async Task PersonName_IsUniqueThroughCreatePersonPreProcessor() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var processor = new CreatePersonPreProcessor(context);

            var request = new CreatePerson
            {
                Name = "john doe"
            };

            await Assert.ThrowsAsync<BadHttpRequestException>(
                () => processor.Process(request, CancellationToken.None));

            Assert.Equal(1, await context.People.CountAsync());
        }

        [Fact]
        public async Task PersonWithoutAssignment_HasNoAstronautRecords() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var person = await context.People.SingleAsync();

            Assert.Empty(await context.AstronautDetails
                .Where(detail => detail.PersonId == person.Id)
                .ToListAsync());

            Assert.Empty(await context.AstronautDuties
                .Where(duty => duty.PersonId == person.Id)
                .ToListAsync());
        }

        [Fact]
        public async Task PersonHasOneCurrentAstronautDutyAfterMultipleAssignments() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var firstStartDate = new DateTime(2026, 1, 10);
            var secondStartDate = new DateTime(2026, 2, 10);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "Pilot",
                firstStartDate);

            await CreateDuty(
                context,
                "john doe",
                "2LT",
                "Commander",
                secondStartDate);

            var details = await context.AstronautDetails
                .Where(detail => detail.PersonId == 1)
                .ToListAsync();

            var duties = await context.AstronautDuties
                .Where(duty => duty.PersonId == 1)
                .OrderBy(duty => duty.DutyStartDate)
                .ToListAsync();

            var currentDetail = Assert.Single(details);

            Assert.Equal("2LT", currentDetail.CurrentRank);
            Assert.Equal("Commander", currentDetail.CurrentDutyTitle);

            Assert.Equal(2, duties.Count);
            Assert.Equal("Pilot", duties[0].DutyTitle);
            Assert.Equal("Commander", duties[1].DutyTitle);
        }

        [Fact]
        public async Task CurrentDuty_DoesNotHaveDutyEndDate() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var startDate = new DateTime(2026, 1, 10);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "Pilot",
                startDate);

            var currentDuty = await context.AstronautDuties
                .SingleAsync(duty => duty.PersonId == 1);

            Assert.Null(currentDuty.DutyEndDate);
        }

        [Fact]
        public async Task PreviousDutyEndsTheDayBeforeNewDutyStarts() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var firstStartDate = new DateTime(2026, 1, 10);
            var secondStartDate = new DateTime(2026, 2, 10);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "Pilot",
                firstStartDate);

            await CreateDuty(
                context,
                "john doe",
                "2LT",
                "Commander",
                secondStartDate);

            var duties = await context.AstronautDuties
                .Where(duty => duty.PersonId == 1)
                .OrderBy(duty => duty.DutyStartDate)
                .ToListAsync();

            Assert.Equal(2, duties.Count);
            Assert.Equal(
                secondStartDate.AddDays(-1),
                duties[0].DutyEndDate);
            Assert.Null(duties[1].DutyEndDate);
        }

        [Fact]
        public async Task RetiredDuty_ClassifiesPersonAsRetired() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var activeStartDate = new DateTime(2026, 1, 10);
            var retiredStartDate = new DateTime(2026, 2, 10);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "Pilot",
                activeStartDate);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "RETIRED",
                retiredStartDate);

            var detail = await context.AstronautDetails
                .SingleAsync(item => item.PersonId == 1);

            Assert.Equal("RETIRED", detail.CurrentDutyTitle);
        }

        [Fact]
        public async Task RetiredDuty_SetsCareerEndDateToTheDayBeforeRetirement() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe"
            });

            await context.SaveChangesAsync();

            var activeStartDate = new DateTime(2026, 1, 10);
            var retiredStartDate = new DateTime(2026, 2, 10);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "Pilot",
                activeStartDate);

            await CreateDuty(
                context,
                "john doe",
                "1LT",
                "RETIRED",
                retiredStartDate);

            var detail = await context.AstronautDetails
                .SingleAsync(item => item.PersonId == 1);

            Assert.Equal(
                retiredStartDate.AddDays(-1),
                detail.CareerEndDate);
        }

        private async Task CreateDuty(
            StargateContext context,
            string name,
            string rank,
            string dutyTitle,
            DateTime startDate) {
            var handler = new CreateAstronautDutyHandler(context);

            await handler.Handle(
                new CreateAstronautDuty
                {
                    Name = name,
                    Rank = rank,
                    DutyTitle = dutyTitle,
                    DutyStartDate = startDate
                },
                CancellationToken.None);
        }

        private StargateContext CreateContext() {
            return new StargateContext(_options);
        }

        public void Dispose() {
            _connection.Dispose();
        }
    }
}
