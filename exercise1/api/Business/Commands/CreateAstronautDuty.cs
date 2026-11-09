
using MediatR;
using MediatR.Pipeline;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Data;
using StargateAPI.Controllers;

namespace StargateAPI.Business.Commands
{
    public class CreateAstronautDuty : IRequest<CreateAstronautDutyResult>
    {
        public required string Name { get; set; }

        public required string Rank { get; set; }

        public required string DutyTitle { get; set; }

        public DateTime DutyStartDate { get; set; }
    }

    public class CreateAstronautDutyPreProcessor : IRequestPreProcessor<CreateAstronautDuty>
    {
        private readonly StargateContext _context;

        public CreateAstronautDutyPreProcessor(StargateContext context)
        {
            _context = context;
        }

        public Task Process(CreateAstronautDuty request, CancellationToken cancellationToken)
        {
            var person = _context.People.AsNoTracking().FirstOrDefault(z => z.Name == request.Name);

            if (person is null) {
                _context.LogEntries.Add(new LogEntry()
                {
                    Description = "CreateAstronautDutyPreProcessor: Person not found.",
                    Exception = "Bad Request",
                    CreatedDateTime = DateTime.Now,
                    Success = false
                });
                _context.SaveChanges();
                throw new BadHttpRequestException("Bad Request");
            }

            var verifyNoPreviousDuty = _context.AstronautDuties.FirstOrDefault(z => z.DutyTitle == request.DutyTitle && z.DutyStartDate == request.DutyStartDate);

            if (verifyNoPreviousDuty is not null) {
                _context.LogEntries.Add(new LogEntry()
                {
                    Description = "CreateAstronautDutyPreProcessor: Duty previously Assigned.",
                    Exception = "Bad Request",
                    CreatedDateTime = DateTime.Now,
                    Success = false
                });
                _context.SaveChanges();
                throw new BadHttpRequestException("Bad Request");
            }

            _context.LogEntries.Add(new LogEntry()
            {
                Description = "CreateAstronautDutyPreProcessor: No Preflight failures.",
                Exception = "",
                CreatedDateTime = DateTime.Now,
                Success = true
            });
            _context.SaveChanges();

            return Task.CompletedTask;
        }
    }

    public class CreateAstronautDutyHandler : IRequestHandler<CreateAstronautDuty, CreateAstronautDutyResult>
    {
        private readonly StargateContext _context;

        public CreateAstronautDutyHandler(StargateContext context)
        {
            _context = context;
        }
        public async Task<CreateAstronautDutyResult> Handle(CreateAstronautDuty request, CancellationToken cancellationToken)
        {
            request.DutyStartDate = request.DutyStartDate == default
                ? DateTime.Now
                : request.DutyStartDate;

            var person = _context.People.AsNoTracking().FirstOrDefault(z => z.Name == request.Name);
            if (person is null) {
                _context.LogEntries.Add(new LogEntry()
                {
                    Description = "CreateAstronautDutyHandler: Person Not Found.",
                    Exception = "Bad Request",
                    CreatedDateTime = DateTime.Now,
                    Success = true
                });
                _context.SaveChanges();
                throw new BadHttpRequestException("Bad Request");
            }
            var astronautDetail = _context.AstronautDetails.FirstOrDefault(x => x.PersonId == person.Id);

            if (astronautDetail == null)
            {
                astronautDetail = new AstronautDetail() { PersonId = person.Id, CurrentDutyTitle = request.DutyTitle, CurrentRank = request.Rank, CareerStartDate = request.DutyStartDate.Date };

                if (request.DutyTitle == "RETIRED")
                {
                    astronautDetail.CareerEndDate = request.DutyStartDate.Date;
                }

                await _context.AstronautDetails.AddAsync(astronautDetail);
            }
            else
            {
                astronautDetail.CurrentDutyTitle = request.DutyTitle;
                astronautDetail.CurrentRank = request.Rank;
                if (request.DutyTitle == "RETIRED")
                {
                    astronautDetail.CareerEndDate = request.DutyStartDate.AddDays(-1).Date;
                }
                _context.AstronautDetails.Update(astronautDetail);
            }

            var astronautDuty = _context.AstronautDuties.Where(x => x.PersonId == person.Id).OrderByDescending(x => x.DutyStartDate).FirstOrDefault();

            if (astronautDuty != null)
            {
                astronautDuty.DutyEndDate = request.DutyStartDate.AddDays(-1).Date;
                _context.AstronautDuties.Update(astronautDuty);
            }

            var newAstronautDuty = new AstronautDuty()
            {
                PersonId = person.Id,
                Rank = request.Rank,
                DutyTitle = request.DutyTitle,
                DutyStartDate = request.DutyStartDate,
                DutyEndDate = null
            };

            await _context.AstronautDuties.AddAsync(newAstronautDuty);

            await _context.SaveChangesAsync();

            return new CreateAstronautDutyResult()
            {
                Id = newAstronautDuty.Id
            };
        }
    }

    public class CreateAstronautDutyResult : BaseResponse
    {
        public int? Id { get; set; }
    }
}
