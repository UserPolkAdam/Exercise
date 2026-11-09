using MediatR;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Data;
using StargateAPI.Business.Dtos;
using StargateAPI.Controllers;

namespace StargateAPI.Business.Queries
{
    public class GetAstronautDutiesByName : IRequest<GetAstronautDutiesByNameResult>
    {
        public string Name { get; set; } = string.Empty;
    }

    public class GetAstronautDutiesByNameHandler : IRequestHandler<GetAstronautDutiesByName, GetAstronautDutiesByNameResult>
    {
        private readonly StargateContext _context;

        public GetAstronautDutiesByNameHandler(StargateContext context)
        {
            _context = context;
        }

        public async Task<GetAstronautDutiesByNameResult> Handle(GetAstronautDutiesByName request, CancellationToken cancellationToken)
        {

            var result = new GetAstronautDutiesByNameResult();

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

    public class GetAstronautDutiesByNameResult : BaseResponse
    {
        public PersonAstronaut Person { get; set; }
        public List<AstronautDuty> AstronautDuties { get; set; } = new List<AstronautDuty>();
    }
}
