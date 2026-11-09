using MediatR.Pipeline;
using MediatR;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Data;
using StargateAPI.Controllers;

namespace StargateAPI.Business.Commands {
    public class UpdatePerson : IRequest<UpdatePersonResult> {
        public required string OldName { get { return field; } set { field = value.ToLower(); } } = string.Empty;
        public required string NewName { get { return field; } set { field = value.ToLower(); } } = string.Empty;
    }

    public class UpdatePersonPreProcessor : IRequestPreProcessor<UpdatePerson> {
        private readonly StargateContext _context;
        public UpdatePersonPreProcessor(StargateContext context) {
            _context = context;
        }
        public Task Process(UpdatePerson request, CancellationToken cancellationToken) {
            var targetPerson = _context.People.AsNoTracking().FirstOrDefault(z => z.Name == request.OldName);
            var destinationPerson = _context.People.AsNoTracking().FirstOrDefault(z => z.Name == request.NewName);
            if (targetPerson is null || destinationPerson is not null) {
                _context.LogEntries.Add(new LogEntry()
                {
                    Description = "UpdatePersonPreProcessor: Name not found or new name already exists.",
                    Exception = "Bad Request",
                    CreatedDateTime = DateTime.Now,
                    Success = false
                });
                _context.SaveChanges();
                throw new BadHttpRequestException("Bad Request");
            }

            return Task.CompletedTask;
        }
    }

    public class UpdatePersonHandler : IRequestHandler<UpdatePerson, UpdatePersonResult> {
        private readonly StargateContext _context;

        public UpdatePersonHandler(StargateContext context) {
            _context = context;
        }
        public async Task<UpdatePersonResult> Handle(UpdatePerson request, CancellationToken cancellationToken) {

            Person person = _context.People.First(z => z.Name == request.OldName);
            person.Name = request.NewName;
            _context.LogEntries.Add(new LogEntry()
            {
                Description = "UpdatePersonHandler: Person Updated.",
                Exception = "",
                CreatedDateTime = DateTime.Now,
                Success = true
            });
            await _context.SaveChangesAsync();

            return new UpdatePersonResult()
            {
                Id = person.Id
            };

        }
    }

    public class UpdatePersonResult : BaseResponse {
        public int Id { get; set; }
    }
}
