using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using StargateAPI.Business.Commands;
using StargateAPI.Business.Data;
using StargateAPI.Controllers;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDbContext<StargateContext>(options => 
    options.UseSqlite(builder.Configuration.GetConnectionString("StarbaseApiDatabase")));

builder.Services.AddMediatR(cfg =>
{
    cfg.AddRequestPreProcessor<CreateAstronautDutyPreProcessor>();
    cfg.AddRequestPreProcessor<CreatePersonPreProcessor>();
    cfg.AddRequestPreProcessor<UpdatePersonPreProcessor>();
    cfg.RegisterServicesFromAssemblies(typeof(Program).Assembly);
});

var app = builder.Build();

//using (var scope = app.Services.CreateScope()) {
//    var db = scope.ServiceProvider.GetRequiredService<StargateContext>();
//    db.Database.Migrate();
//}

app.UseExceptionHandler(exceptionApp => {
    exceptionApp.Run(async context => {
        var exception = context.Features
            .Get<IExceptionHandlerFeature>()?
            .Error;

        var isBadRequest = exception is BadHttpRequestException;

        context.Response.StatusCode = isBadRequest
            ? StatusCodes.Status400BadRequest
            : StatusCodes.Status500InternalServerError;

        await context.Response.WriteAsJsonAsync(new BaseResponse
        {
            Success = false,
            Message = isBadRequest
                ? exception!.Message
                : "An unexpected error occurred.",
            ResponseCode = context.Response.StatusCode
        });
    });
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();


