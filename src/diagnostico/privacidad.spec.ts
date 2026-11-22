import { ContextoDiagnostico } from './contexto';
import {
  DATO_OCULTO,
  DatosPersonales,
  limpiarContexto,
  ocultarDatosPersonales,
} from './privacidad';

const DATOS: DatosPersonales = {
  nombre: 'María José',
  apellido: 'Núñez',
};
const X = DATO_OCULTO;

describe('ocultarDatosPersonales', () => {
  it('hides the name and surname with or without accents and in any case', () => {
    expect(
      ocultarDatosPersonales(
        'MARIA vino con su hermana; Nuñez pidió turno',
        DATOS,
      ),
    ).toBe(`${X} vino con su hermana; ${X} pidió turno`);
    expect(ocultarDatosPersonales('maría josé núñez', DATOS)).toBe(
      `${X} ${X} ${X}`,
    );
  });

  it('only hides whole words', () => {
    expect(ocultarDatosPersonales('Mariana y Josefina', DATOS)).toBe(
      'Mariana y Josefina',
    );
  });

  it('hides emails and phone numbers', () => {
    expect(
      ocultarDatosPersonales(
        'Escribirle a otra.persona@hotmail.com o al (299) 412-3456, o +54 9 299 555 0000',
        DATOS,
      ),
    ).toBe(`Escribirle a ${X} o al ${X}, o ${X}`);
  });

  it('keeps quantities, volumes, times and dates', () => {
    const texto =
      'Tintura 7.1 30 g + oxidante 20 vol 45 ml, pose 35 min. Volvió el 2026-10-01 y el 10/10.';
    expect(ocultarDatosPersonales(texto, DATOS)).toBe(texto);
  });

  it('keeps dates written with dashes or dots, as the staff writes them', () => {
    const texto =
      'Decoloración 15-03-2024, retoque 22.11.2026, matiz 5.3.26 y 1-2-2025.';
    expect(ocultarDatosPersonales(texto, DATOS)).toBe(texto);
  });

  it('still hides phones written with dashes or spaces next to a date', () => {
    expect(
      ocultarDatosPersonales('El 15-03-2024 dejó el 15-4412-3456', DATOS),
    ).toBe(`El 15-03-2024 dejó el ${X}`);
    expect(ocultarDatosPersonales('Tel 299-412-3456', DATOS)).toBe(`Tel ${X}`);
  });

  it('ignores name parts shorter than 3 letters', () => {
    expect(
      ocultarDatosPersonales('Lo de siempre', {
        ...DATOS,
        nombre: 'Lo',
        apellido: 'De',
      }),
    ).toBe('Lo de siempre');
  });
});

describe('limpiarContexto', () => {
  it('cleans every free-text field and leaves the rest as is', () => {
    const contexto: ContextoDiagnostico = {
      fichaActual: {
        fecha: '2026-11-22',
        servicio: 'Retoque de Color',
        porosidad: 'ALTA',
        elasticidad: null,
        porcentajeCanas: null,
        tipoDePelo: null,
        volumenDePelo: null,
        tratamientosPrevios: 'María se planchó',
        observacionesInternas: null,
      },
      alergias: ['Amoníaco', 'Lo que dijo Núñez'],
      fichasAnteriores: [
        {
          fecha: '2026-10-01',
          servicio: 'Balayage',
          porosidad: 'MEDIA',
          elasticidad: null,
          porcentajeCanas: 10,
          tipoDePelo: null,
          volumenDePelo: null,
          tratamientosPrevios: null,
          observacionesInternas: 'Llamar al 2994123456',
          indicacionesCliente: 'María: sin sulfatos',
          formulas: [
            {
              descripcion: 'Raíz de María',
              oxidanteVolumen: 20,
              tiempoPoseMin: 35,
              insumos: [],
            },
          ],
        },
      ],
      articulos: [],
    };

    const limpio = limpiarContexto(contexto, DATOS);

    expect(limpio.fichaActual.tratamientosPrevios).toBe(`${X} se planchó`);
    expect(limpio.fichaActual.porosidad).toBe('ALTA');
    expect(limpio.alergias).toEqual(['Amoníaco', `Lo que dijo ${X}`]);
    const [anterior] = limpio.fichasAnteriores;
    expect(anterior.observacionesInternas).toBe(`Llamar al ${X}`);
    expect(anterior.indicacionesCliente).toBe(`${X}: sin sulfatos`);
    expect(anterior.formulas[0].descripcion).toBe(`Raíz de ${X}`);
    expect(anterior.servicio).toBe('Balayage');
    expect(JSON.stringify(limpio)).not.toMatch(
      /mar[ií]a|n[uú][ñn]ez|2994123456/i,
    );
  });
});
