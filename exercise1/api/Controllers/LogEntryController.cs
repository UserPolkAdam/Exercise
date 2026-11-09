using MediatR;
using Microsoft.AspNetCore.Mvc;
using StargateAPI.Business.Queries;
using System.Net;

namespace StargateAPI.Controllers;

[ApiController]
[Route("[controller]")]
public sealed class LogEntryController : ControllerBase {
    private readonly IMediator _mediator;

    public LogEntryController(IMediator mediator) {
        _mediator = mediator;
    }

    [HttpGet("")]
    public async Task<IActionResult> GetLogEntries(CancellationToken cancellationToken) {
        try {
            var result = await _mediator.Send(
                new GetLogEntries(),
                cancellationToken);

            return this.GetResponse(result);
        }
        catch (Exception ex) {
            return this.GetResponse(new BaseResponse
            {
                Message = ex.Message,
                Success = false,
                ResponseCode = (int)HttpStatusCode.InternalServerError
            });
        }
    }
}