using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace StargateAPI.Business.Data {
    [Table("LogEntry")]
    public class LogEntry {
        public int Id { get; set; }
        public DateTime CreatedDateTime { get; set; }
        public bool Success { get; set; }
        public string Description { get; set; } = string.Empty;
        public string Exception { get; set; } = string.Empty;
    }

    public class LogEntryConfiguration : IEntityTypeConfiguration<LogEntry> {
        public void Configure(EntityTypeBuilder<LogEntry> builder) {
            builder.HasKey(x => x.Id);
            builder.Property(x => x.Id).ValueGeneratedOnAdd();
            builder.Property(x => x.CreatedDateTime).ValueGeneratedOnAdd();
        }
    }
}
