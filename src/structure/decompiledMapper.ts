import {
    DecompiledWriter,
    FunctionWriter,
    InstructionWriter,
    ReferenceWriter
} from "./decompiledWriter";

import {
    DecompiledReader,
    FunctionReader,
    InstructionReader,
    ReferenceReader
} from "./decompiledReader";

export class DecompiledMapper {

    public static writerToReader(
        writer: DecompiledWriter
    ): DecompiledReader {

        const reader = new DecompiledReader();

        reader.comment = "";

        for (const func of writer.functions) {

            const readerFunction = this.functionWriterToReader(func);

            reader.add(readerFunction);
        }

        reader.references = writer.references.map(
            reference => this.referenceWriterToReader(reference)
        );

        return reader;
    }

    public static readerToWriter(
        reader: DecompiledReader
    ): DecompiledWriter {

        const writer = new DecompiledWriter();

        for (const func of reader.functions) {

            const writerFunction = this.functionReaderToWriter(func);

            writer.add(writerFunction);
        }

        writer.references = reader.references.map(
            reference => this.referenceReaderToWriter(reference)
        );

        return writer;
    }

    private static functionWriterToReader(
        func: FunctionWriter
    ): FunctionReader {

        const readerFunction = new FunctionReader(
            func.name,
            func.offset,
            ""
        );

        for (const instruction of func.Instructions) {

            readerFunction.add(
                this.instructionWriterToReader(instruction)
            );
        }

        return readerFunction;
    }

    private static functionReaderToWriter(
        func: FunctionReader
    ): FunctionWriter {

        const writerFunction = new FunctionWriter(
            func.name,
            func.offset
        );

        for (const instruction of func.Instructions) {

            writerFunction.add(
                this.instructionReaderToWriter(instruction)
            );
        }

        return writerFunction;
    }

    private static instructionWriterToReader(
        instruction: InstructionWriter
    ): InstructionReader {

        return new InstructionReader(
            instruction.offset,
            instruction.opcode,
            ""
        );
    }

    private static instructionReaderToWriter(
        instruction: InstructionReader
    ): InstructionWriter {

        return new InstructionWriter(
            instruction.offset,
            instruction.opcode
        );
    }

    private static referenceWriterToReader(
        reference: ReferenceWriter
    ): ReferenceReader {

        return new ReferenceReader(
            reference.offsetA,
            reference.offsetB,
            ""
        );
    }

    private static referenceReaderToWriter(
        reference: ReferenceReader
    ): ReferenceWriter {

        return new ReferenceWriter(
            reference.offsetA,
            reference.offsetB
        );
    }
}