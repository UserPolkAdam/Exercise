using MediatR;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Data;
using StargateAPI.Controllers;

namespace StargateAPI.Business.Queries;

public sealed record GetLogEntries : IRequest<GetLogEntriesResult>;

public sealed class GetLogEntriesHandler : IRequestHandler<GetLogEntries, GetLogEntriesResult> {
    private readonly StargateContext _context;

    public GetLogEntriesHandler(StargateContext context) {
        _context = context;
    }

    public async Task<GetLogEntriesResult> Handle(
        GetLogEntries request,
        CancellationToken cancellationToken) {
        var entries = await _context.LogEntries
            .AsNoTracking()
            .OrderByDescending(entry => entry.CreatedDateTime)
            .ThenByDescending(entry => entry.Id)
            .ToListAsync(cancellationToken);

        return new GetLogEntriesResult
        {
            Items = entries
        };
    }
}

public sealed class GetLogEntriesResult : BaseResponse {
    public IReadOnlyList<LogEntry> Items { get; init; } = [];
}