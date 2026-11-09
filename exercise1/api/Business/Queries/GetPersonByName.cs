using MediatR;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Data;
using StargateAPI.Business.Dtos;
using StargateAPI.Controllers;

namespace StargateAPI.Business.Queries
{
    public class GetPersonByName : IRequest<GetPersonByNameResult>
    {
        public required string Name { get; set; } = string.Empty;
    }

    public class GetPersonByNameHandler : IRequestHandler<GetPersonByName, GetPersonByNameResult>
    {
        private readonly StargateContext _context;
        public GetPersonByNameHandler(StargateContext context)
        {
            _context = context;
        }

        public async Task<GetPersonByNameResult> Handle(GetPersonByName request, CancellationToken cancellationToken)
        {
            var result = new GetPersonByNameResult();

            var person = await _context.People
                .AsNoTracking()
                .Where(person => person.Name == request.Name)
                .Select(person => new PersonAstronaut
                {
                    PersonId = person.Id,
                    Name = person.Name,
                    CurrentRank = person.AstronautDetail != null
                        ? person.AstronautDetail.CurrentRank
                        : string.Empty,
                    CurrentDutyTitle = person.AstronautDetail != null
                        ? person.AstronautDetail.CurrentDutyTitle
                        : string.Empty,
                    CareerStartDate = person.AstronautDetail != null
                        ? person.AstronautDetail.CareerStartDate
                        : null,
                    CareerEndDate = person.AstronautDetail != null
                        ? person.AstronautDetail.CareerEndDate
                        : null
                })
                .FirstOrDefaultAsync(cancellationToken);

            result.Person = person;

            if (person is null) {
                return result;
            }

            result.AstronautDuties = await _context.AstronautDuties
                .AsNoTracking()
                .Where(duty => duty.PersonId == person.PersonId)
                .OrderByDescending(duty => duty.DutyStartDate)
                .ToListAsync(cancellationToken);

            return result;
        }
    }

    public class GetPersonByNameResult : BaseResponse
    {
        public PersonAstronaut? Person { get; set; }

        public List<AstronautDuty> AstronautDuties { get; set; } = new();
    }
}
