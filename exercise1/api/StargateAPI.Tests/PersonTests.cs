using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Commands;
using StargateAPI.Business.Data;
using StargateAPI.Business.Queries;

namespace StargateAPI.Tests {
    public sealed class PersonTests : IDisposable {
        private readonly SqliteConnection _connection;
        private readonly DbContextOptions<StargateContext> _options;

        public PersonTests() {
            _connection = new SqliteConnection("Data Source=:memory:");
            _connection.Open();

            _options = new DbContextOptionsBuilder<StargateContext>()
                .UseSqlite(_connection)
                .Options;

            using var context = CreateContext();
            context.Database.EnsureCreated();
        }

        [Fact]
        public async Task CreatePersonHandler_CreatesPersonAndSuccessLog() {
            await using var context = CreateContext();

            var request = new CreatePerson
            {
                Name = "John Doe"
            };

            var handler = new CreatePersonHandler(context);

            var result = await handler.Handle(request, CancellationToken.None);

            var person = await context.People.SingleAsync();
            var log = await context.LogEntries.SingleAsync();

            Assert.True(result.Id > 0);
            Assert.Equal(result.Id, person.Id);
            Assert.Equal("john doe", person.Name);
            Assert.True(log.Success);
            Assert.Equal(
                "CreatePersonHandler: Person Created.",
                log.Description);
        }

        [Fact]
        public async Task CreatePersonPreProcessor_ThrowsWhenNameAlreadyExists() {
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

            var log = await context.LogEntries.SingleAsync();

            Assert.False(log.Success);
            Assert.Equal(
                "CreatePersonPreProcessor: Name already exists.",
                log.Description);
        }

        [Fact]
        public async Task UpdatePersonHandler_UpdatesPersonNameAndCreatesSuccessLog() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "old name"
            });

            await context.SaveChangesAsync();

            var handler = new UpdatePersonHandler(context);

            var result = await handler.Handle(
                new UpdatePerson
                {
                    OldName = "old name",
                    NewName = "new name"
                },
                CancellationToken.None);

            var updatedPerson = await context.People
                .SingleAsync(person => person.Id == 1);

            var logEntry = await context.LogEntries
                .SingleAsync();

            Assert.Equal(1, result.Id);
            Assert.Equal("new name", updatedPerson.Name);
            Assert.True(logEntry.Success);
            Assert.Equal(
                "UpdatePersonHandler: Person Updated.",
                logEntry.Description);
        }

        [Fact]
        public async Task UpdatePersonPreProcessor_ThrowsWhenOldNameDoesNotExist() {
            await using var context = CreateContext();

            var processor = new UpdatePersonPreProcessor(context);

            var request = new UpdatePerson
            {
                OldName = "missing name",
                NewName = "new name"
            };

            await Assert.ThrowsAsync<BadHttpRequestException>(
                () => processor.Process(request, CancellationToken.None));

            var logEntry = await context.LogEntries
                .SingleAsync();

            Assert.False(logEntry.Success);
            Assert.Equal(
                "UpdatePersonPreProcessor: Name not found or new name already exists.",
                logEntry.Description);
        }

        [Fact]
        public async Task UpdatePersonPreProcessor_ThrowsWhenNewNameAlreadyExists() {
            await using var context = CreateContext();

            context.People.AddRange(
                new Person { Id = 1, Name = "old name" },
                new Person { Id = 2, Name = "existing name" });

            await context.SaveChangesAsync();

            var processor = new UpdatePersonPreProcessor(context);

            var request = new UpdatePerson
            {
                OldName = "old name",
                NewName = "existing name"
            };

            await Assert.ThrowsAsync<BadHttpRequestException>(
                () => processor.Process(request, CancellationToken.None));

            Assert.Equal(1, await context.LogEntries.CountAsync());
        }

        [Fact]
        public async Task GetPeopleHandler_ReturnsPeopleWithAstronautDetails() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe",
                AstronautDetail = new AstronautDetail
                {
                    Id = 1,
                    PersonId = 1,
                    CurrentRank = "1LT",
                    CurrentDutyTitle = "Commander",
                    CareerStartDate = new DateTime(2026, 1, 1)
                }
            });

            await context.SaveChangesAsync();

            var handler = new GetPeopleHandler(context);

            var result = await handler.Handle(
                new GetPeople(),
                CancellationToken.None);

            var person = Assert.Single(result.Items);

            Assert.Equal(1, result.Page);
            Assert.Equal(25, result.PageSize);
            Assert.Equal(1, result.TotalCount);
            Assert.Equal(1, result.TotalPages);

            Assert.Equal(1, person.PersonId);
            Assert.Equal("john doe", person.Name);
            Assert.Equal("1LT", person.CurrentRank);
            Assert.Equal("Commander", person.CurrentDutyTitle);
            Assert.Equal(
                new DateTime(2026, 1, 1),
                person.CareerStartDate);
        }

        [Fact]
        public async Task GetPersonByNameHandler_ReturnsMatchingPerson() {
            await using var context = CreateContext();

            context.People.Add(new Person
            {
                Id = 1,
                Name = "john doe",
                AstronautDetail = new AstronautDetail
                {
                    Id = 1,
                    PersonId = 1,
                    CurrentRank = "1LT",
                    CurrentDutyTitle = "Commander",
                    CareerStartDate = new DateTime(2026, 1, 1)
                }
            });

            await context.SaveChangesAsync();

            var handler = new GetPersonByNameHandler(context);

            var result = await handler.Handle(
                new GetPersonByName
                {
                    Name = "john doe"
                },
                CancellationToken.None);

            Assert.NotNull(result.Person);
            Assert.Equal(1, result.Person.PersonId);
            Assert.Equal("john doe", result.Person.Name);
            Assert.Equal("Commander", result.Person.CurrentDutyTitle);
        }

        [Fact]
        public async Task GetPersonByNameHandler_ReturnsNullWhenPersonDoesNotExist() {
            await using var context = CreateContext();

            var handler = new GetPersonByNameHandler(context);

            var result = await handler.Handle(
                new GetPersonByName
                {
                    Name = "missing person"
                },
                CancellationToken.None);

            Assert.Null(result.Person);
        }

        private StargateContext CreateContext() {
            return new StargateContext(_options);
        }

        public void Dispose() {
            _connection.Dispose();
        }
    }
}
