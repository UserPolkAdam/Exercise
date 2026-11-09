using MediatR;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Data;
using StargateAPI.Business.Dtos;
using StargateAPI.Controllers;

namespace StargateAPI.Business.Queries
{
    public class GetPeople : IRequest<GetPeopleResult>
    {
        public int Page { get; set; } = 1;
        public int PageSize { get; set; } = 25;
        public string? Search { get; set; }
    }

    public class GetPeopleHandler : IRequestHandler<GetPeople, GetPeopleResult>
    {
        public readonly StargateContext _context;
        public GetPeopleHandler(StargateContext context)
        {
            _context = context;
        }
        public async Task<GetPeopleResult> Handle(GetPeople request, CancellationToken cancellationToken)
        {
            var page = Math.Max(request.Page, 1);
            var pageSize = Math.Clamp(request.PageSize, 1, 100);
            var search = request.Search?.Trim().ToLower();

            var query = _context.People
                .AsNoTracking()
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search)) {
                query = query.Where(person => person.Name.Contains(search));
            }

            var totalCount = await query.CountAsync(cancellationToken);

            var people = await query
                .OrderBy(person => person.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
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
                .ToListAsync(cancellationToken);

            return new GetPeopleResult
            {
                Items = people,
                Page = page,
                PageSize = pageSize,
                TotalCount = totalCount,
                TotalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
            };
        }
    }

    public class GetPeopleResult : BaseResponse
    {
        public List<PersonAstronaut> Items { get; set; } = new();
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }
        public int TotalPages { get; set; }

    }
}
